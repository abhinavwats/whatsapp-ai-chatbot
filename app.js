const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// In-memory store for each user
const userStore = {};

// Webhook endpoint for Twilio to call
app.post('/webhook', async (req, res) => {
  const userMessage = req.body.Body?.trim();
  const fromNumber = req.body.From;
  console.log("Incoming message:", userMessage, "| From:", fromNumber);

  let replyMessage = '';

  try {
    // Handle "set" command
    if (userMessage?.toLowerCase().startsWith("set ")) {
      const [, key, ...valueParts] = userMessage.split(" ");
      const value = valueParts.join(" ");
      if (!key || !value) {
        replyMessage = "Please provide both a key and a value. Example: set name Abhinav";
      } else {
        if (!userStore[fromNumber]) userStore[fromNumber] = {};
        userStore[fromNumber][key.toLowerCase()] = value;
        replyMessage = `✅ Set ${key} = ${value}`;
      }

    // Handle "get" command
    } else if (userMessage?.toLowerCase().startsWith("get ")) {
      const [, key] = userMessage.split(" ");
      if (!key) {
        replyMessage = "Please provide a key. Example: get name";
      } else if (userStore[fromNumber] && userStore[fromNumber][key.toLowerCase()]) {
        replyMessage = `🔍 ${key} = ${userStore[fromNumber][key.toLowerCase()]}`;
      } else {
        replyMessage = `⚠️ No value found for "${key}"`;
      }

    // Otherwise, handle with OpenAI GPT
    } else {
      const openaiResponse = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [{ role: 'user', content: userMessage }],
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          }
        }
      );
      replyMessage = openaiResponse.data.choices[0].message.content;
    }

    // Ensure 'To' and 'From' use proper format
    const to = fromNumber.startsWith("whatsapp:") ? fromNumber : `whatsapp:${fromNumber}`;
    const from = process.env.TWILIO_NUMBER;

    const payload = new URLSearchParams({
      Body: replyMessage,
      From: from,
      To: to
    });

    console.log("Payload to Twilio:", payload.toString());

    // Send reply via Twilio
    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_SID}/Messages.json`,
      payload,
      {
        auth: {
          username: process.env.TWILIO_SID,
          password: process.env.TWILIO_AUTH_TOKEN
        }
      }
    );

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error handling message:", error.message);
    if (error.response?.data) {
      console.error("🔍 Twilio response:", JSON.stringify(error.response.data, null, 2));
    }
    res.sendStatus(500);
  }
});

// Render-compatible port setup
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Bot is running on port ${PORT}`));