const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store API keys in memory (for demo - in production use a database)
let userApiKeys = {};

// Available models
const availableModels = [
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
  'gemini-1.0-pro'
];

// Tone mappings
const toneInstructions = {
  professional: "Respond in a professional, formal tone. Use precise language.",
  friendly: "Respond in a warm, friendly tone. Be approachable.",
  casual: "Respond in a casual, relaxed tone. Use informal language.",
  humorous: "Respond with wit and humor when appropriate."
};

// Length mappings
const lengthInstructions = {
  1: "Keep response very concise - maximum 2-3 sentences.",
  2: "Keep response brief - about 1 short paragraph.",
  3: "Provide medium-length response - 1-2 paragraphs.",
  4: "Provide detailed response - 2-3 paragraphs.",
  5: "Provide comprehensive response - multiple paragraphs."
};

// Test API key with all models
async function findWorkingModel(apiKey) {
  for (const model of availableModels) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const generativeModel = genAI.getGenerativeModel({ model });
      const result = await generativeModel.generateContent("Test");
      await result.response;
      return model; // This model works!
    } catch (error) {
      console.log(`Model ${model} failed:`, error.message);
      continue;
    }
  }
  return null; // No models worked
}

// Routes
app.post('/api/setup', async (req, res) => {
  try {
    const { apiKey, sessionId = 'default' } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    // Find a working model
    const workingModel = await findWorkingModel(apiKey);
    
    if (!workingModel) {
      return res.status(400).json({ 
        error: 'No working model found with this API key. Please check your key.' 
      });
    }

    // Store the API key and model
    userApiKeys[sessionId] = {
      apiKey,
      model: workingModel,
      createdAt: Date.now()
    };

    res.json({ 
      success: true, 
      model: workingModel,
      message: `Setup successful! Using ${workingModel}`
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Setup failed: ' + error.message 
    });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { 
      message, 
      customPrompt, 
      responseLength = 3, 
      tone = 'professional', 
      temperature = 0.5,
      sessionId = 'default'
    } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const userConfig = userApiKeys[sessionId];
    if (!userConfig) {
      return res.status(400).json({ 
        error: 'Please setup your API key first by visiting /setup' 
      });
    }

    const { apiKey, model } = userConfig;

    // Build system instruction
    let systemInstruction = customPrompt || "You are a helpful assistant.";
    systemInstruction += ` ${toneInstructions[tone]}`;
    systemInstruction += ` ${lengthInstructions[responseLength]}`;

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const generativeModel = genAI.getGenerativeModel({
      model,
      generationConfig: {
        temperature: parseFloat(temperature),
        maxOutputTokens: responseLength * 200,
        topP: 0.8,
        topK: 40
      },
      systemInstruction
    });

    // Generate response
    const result = await generativeModel.generateContent(message);
    const response = await result.response;
    const text = response.text();

    res.json({ 
      response: text,
      modelUsed: model
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Chat failed: ' + error.message 
    });
  }
});

app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'Server is running',
    activeSessions: Object.keys(userApiKeys).length
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit: https://your-project-name.glitch.me`);
});
