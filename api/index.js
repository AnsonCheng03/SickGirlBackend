const express = require("express");
const WebSocket = require("ws");
const { jsonrepair } = require("jsonrepair");
require("dotenv").config();

const app = express();
app.use(express.json());
const wss = new WebSocket.Server({ noServer: true });

const createThread = async () => {
  const response = await fetch("https://api.openai.com/v1/threads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "OpenAI-Beta": "assistants=v2",
    },
  });
  const body = await response.json();
  return body.id;
};

const sendMessage = async (threadId, userInput) => {
  const response = await fetch(
    `https://api.openai.com/v1/threads/${threadId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({ role: "user", content: userInput }),
    }
  );
  const body = await response.json();
  // console.log("Message sent:", body);
  return body;
};

const createRun = async (userInput, ws, threadId) => {
  const response = await fetch(
    `https://api.openai.com/v1/threads/${threadId}/runs`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({
        assistant_id: process.env.OPENAI_ASSISTANT_ID,
        stream: true,
      }),
    }
  );

  if (!response.ok) {
    ws.send(
      JSON.stringify({ error: `HTTP error! Status: ${response.status}` })
    );
    console.error(
      "HTTP error! Status:",
      response.status,
      await response.text()
    );
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });

    chunk.split("\n").forEach((line) => {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.replace("data: ", "").trim());
          if (data.delta?.content && data.delta.content[0]?.text?.value) {
            fullText += data.delta.content[0].text.value;
            const { content, emotion } = JSON.parse(jsonrepair(fullText));
            ws.send(JSON.stringify({ threadId, message: content, emotion }));
          }
        } catch (error) {
          // console.log("Error:", error);
        }
      }
    });
  }

  // ws.send(JSON.stringify({ threadId, done: true }));
};

// app.get("/game", (req, res) => {
//   res.send("Health check");
// });

app.get("/game", async (req, res) => {
  // Respond with a WebSocket URL the client can connect to
  wss.handleUpgrade(req, req.socket, Buffer.alloc(0), (ws) => {
    ws.on("open", () => {
      console.log("WebSocket connected");
    });

    ws.on("message", async (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage);
        const userInput = message.userInput;
        const threadId = message.threadId || (await createThread());

        if (!threadId) {
          ws.send(JSON.stringify({ error: "Missing threadId" }));
          return;
        }

        await sendMessage(threadId, userInput);

        console.log(`Processing chat for thread ${threadId}`);
        await createRun(userInput, ws, threadId);
      } catch (error) {
        console.error("Error processing message:", error);
        ws.send(JSON.stringify({ error: "Invalid message format" }));
      }
    });

    ws.on("close", () => {
      console.log("WebSocket disconnected");
    });
  });
});

app.get("/", (req, res) => res.send("Express on Vercel"));

app.listen(3000, () => console.log("Server ready on port 3000."));

module.exports = app;
