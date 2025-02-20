const express = require("express");
const enableWs = require("express-ws");
require("dotenv").config();

const app = express();
app.use(express.json());
enableWs(app);

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

app.ws("/ws", (ws, req) => {
  ws.on("open", () => {
    console.log("WebSocket connected");
  });

  ws.on("message", async (message) => {
    try {
      const { userInput, threadId } = JSON.parse(message);

      if (!threadId) {
        ws.send(JSON.stringify({ error: "Missing threadId" }));
        return;
      }

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

const createRun = async (userInput, ws, threadId) => {
  const response = await fetch("https://api.openai.com/v1/threads/runs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "OpenAI-Beta": "assistants=v2",
    },
    body: JSON.stringify({
      assistant_id: process.env.OPENAI_ASSISTANT_ID,
      stream: true,
      thread: {
        id: threadId,
        messages: [{ role: "user", content: userInput }],
      },
    }),
  });

  if (!response.ok) {
    ws.send(
      JSON.stringify({ error: `HTTP error! Status: ${response.status}` })
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
            ws.send(JSON.stringify({ threadId, text: fullText }));
          }
        } catch (error) {
          console.log("Error parsing JSON:", error, line);
        }
      }
    });
  }

  ws.send(JSON.stringify({ threadId, done: true }));
};

app.get("/game", (req, res) => {
  res.send("Health check");
});

app.post("/game", async (req, res) => {
  const threadId = req.body.threadId || (await createThread());

  // Respond with a WebSocket URL the client can connect to
  res.json({ websocketUrl: `/ws/game?threadId=${threadId}` });
});

app.get("/", (req, res) => res.send("Express on Vercel"));

app.listen(3000, () => console.log("Server ready on port 3000."));




module.exports = app;
