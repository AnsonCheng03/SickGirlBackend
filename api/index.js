const express = require("express");
require("dotenv").config();

const app = express();
app.use(express.json());

const createThread = async () => {
  // send POST request to create thread https://api.openai.com/v1/threads
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

// const sendMessage = async (threadId, userInput) => {
//   const response = await fetch(
//     `https://api.openai.com/v1/threads/${threadId}/messages`,
//     {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//         Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
//         "OpenAI-Beta": "assistants=v2",
//       },
//       body: JSON.stringify({ role: "user", content: userInput }),
//     }
//   );
//   const body = await response.json();

//   console.log(body);

//   return body;
// };

const createRun = async (userInput, res) => {
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
        messages: [
          {
            role: "user",
            content: userInput,
          },
        ],
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Response body is undefined");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let currentEvent = "";

  function onEvent(eventName, data) {
    console.log(eventName);
    if (eventName === "thread.run.completed") {
      // res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      return true;
    } else if (eventName === "thread.message.delta") {
      console.log(data?.delta?.content);
      if (data?.delta?.content && data.delta.content[0]?.text?.value) {
        fullText += data.delta.content[0].text.value; // Append new content
        res.write(`data: ${JSON.stringify({ text: fullText })}\n\n`);
      }
    }
    return false;
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });

    chunk.split("\n").forEach((line) => {
      if (line.startsWith("event: ")) {
        currentEvent = line.replace("event: ", "").trim(); // Save current event
      } else if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.replace("data: ", "").trim());
          if (currentEvent) {
            onEvent(currentEvent, data);
          }
        } catch (error) {
          console.error("Error parsing JSON:", error, line);
        }
      }
    });
  }
};

app.get("/game", (req, res) => {
  res.send("Health check");
});

app.post("/game", async (req, res) => {
  // body: threadId,userInput
  let threadId = req.body.threadId;
  const userInput = req.body.userInput;

  if (!threadId) {
    threadId = await createThread();
  }

  // sendMessage(threadId, userInput);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  createRun(userInput, res);
  return;

  res.send("Express on Vercel");
});

app.get("/", (req, res) => res.send("Express on Vercel"));

app.listen(3000, () => console.log("Server ready on port 3000."));

module.exports = app;
