require("dotenv").config();
// Importing the modules
const express = require("express");
const app = express();
const http = require("http");
const WebSocket = require("ws");
const server = http.createServer(app);

const bodyParser = require("body-parser");

app.use(bodyParser.json());

// Create a WebSocket server by providing the HTTP server instance
const wss = new WebSocket.Server({ server });

// Store client connections
const clients = new Map();

// Event listener for WebSocket connections
wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      const userId = data.userId;

      // Store the connection with the provided user ID
      if (!clients.get(userId)) {
        clients.set(userId, ws);
        console.log(`User ${userId} connected.`);
      } else {
        console.log(`User ${userId} already connected.`);
      }
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  });

  // Event listener for closing connections
  ws.on("close", () => {
    // Remove the user from the clients map when they disconnect
    const disconnectedUserIdEntry = Array.from(clients.entries()).find(
      ([key, value]) => value === ws
    );
    if (disconnectedUserIdEntry) {
      const disconnectedUserId = disconnectedUserIdEntry[0];
      clients.delete(disconnectedUserId);
      console.log(`User ${disconnectedUserId} disconnected.`);
    }
  });
});

// Sample service provider data (for demonstration purposes)
const serviceProviders = [
  {
    id: "+254706434259",
    name: "Provider 1",
    status: "online",
    location: { lat: -1.286389, lon: 36.817223 },
  },
  {
    id: 54321,
    name: "Provider 2",
    status: "online",
    location: { lat: -1.225602, lon: 36.924546 },
  },
  // ... more service providers ...
];
app.get("/", (req, res) => {
  res.send("Hello from the server");
});

app.post("/assign-service-provider", (req, res) => {
  const clientLocation = req.body.clientLocation;
  const proximityThreshold = 70; // Example: Max distance in kilometers
  const responseTimeout = 10000; // 1 minute in milliseconds

  // Filter online service providers within proximity
  const eligibleProviders = serviceProviders.filter(
    (provider) =>
      provider.status === "online" &&
      calculateDistance(clientLocation, provider.location) <= proximityThreshold
  );

  // Sort eligible providers by proximity
  eligibleProviders.sort(
    (a, b) =>
      calculateDistance(clientLocation, a.location) -
      calculateDistance(clientLocation, b.location)
  );

  // Recursive function to iterate through eligible providers
  async function tryProvider(index) {
    if (index >= eligibleProviders.length) {
      // Handle case where no eligible providers accepted the request
      return res
        .status(400)
        .json({ success: false, message: "No available service providers." });
    }

    const provider = eligibleProviders[index];
    let hasResponded = false;

    // Send service request to the provider
    // const requestPromise = justSendServiceRequest(provider);
    const requestPromise = sendServiceRequest(provider);

    // Set a timeout for provider response
    const timeout = setTimeout(() => {
      if (!hasResponded) {
        // Move on to the next provider if no response within timeout
        tryProvider(index + 1);
      }
    }, responseTimeout);

    try {
      const response = await requestPromise;

      clearTimeout(timeout); // Clear the response timeout
      hasResponded = true;

      if (response.accepted) {
        return res.json({ success: true, provider: provider });
      } else {
        // Move on to the next provider if denied
        tryProvider(index + 1);
      }
    } catch (error) {
      // Handle request failure and move on to the next provider
      clearTimeout(timeout); // Clear the response timeout
      tryProvider(index + 1);
    }
  }

  // Start trying providers from the beginning of the list
  tryProvider(0);
});

// Send a service request to a provider
// function justSendServiceRequest(provider) {
//   sendToClient(provider.id.toString(), `New request sent to ${provider.id}`);
//   return new Promise((resolve, reject) => {
//     // Simulate some response (accepted or denied)
//     const randomResponse =
//       Math.random() < 0.5 ? { accepted: true } : { accepted: false };
//     setTimeout(() => resolve(randomResponse), 1000); // Simulating delay
//   });
// }

// Send a service request to a provider
async function sendServiceRequest(provider) {
  try {
    const response = JSON.parse(
      await sendAndWaitForResponse(
        provider.id.toString(),
        `Hello ${provider.id}, this is a ping from the server`
      )
    );

    if (response) {
      // console.log(
      //   `Received response from user ${provider.id}: ${response.message}`
      // );
      return new Promise((resolve, reject) => {
        // resolve({ accepted: true });
        response.userId === provider.id.toString()
          ? resolve({ accepted: true })
          : resolve({ accepted: false });
      });
    } else {
      resolve({ accepted: false });
    }
  } catch (error) {
    console.log(error);
  }
}

// Function to send a message and wait for a response
function sendAndWaitForResponse(userId, message) {
  return new Promise((resolve, reject) => {
    const client = clients.get(userId);
    if (client) {
      client.send(message);
      client.on("message", (responseMessage) => {
        // Handle the response message
        resolve(responseMessage);
      });
    } else {
      // reject(new Error("User not connected"));
      return;
    }
  });
}

function sendToClient(userId, message) {
  const client = clients.get(userId);
  if (client) {
    client.send(message);
  }
}

// Function to calculate distance between two coordinates using Haversine formula
function calculateDistance(coord1, coord2) {
  // ... Haversine formula implementation ...
  const earthRadius = 6371; // Radius of the Earth in kilometers

  const lat1 = degToRad(coord1.lat);
  const lon1 = degToRad(coord1.lon);
  const lat2 = degToRad(coord2.lat);
  const lon2 = degToRad(coord2.lon);

  const dlat = lat2 - lat1;
  const dlon = lon2 - lon1;

  const a =
    Math.sin(dlat / 2) * Math.sin(dlat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) * Math.sin(dlon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = earthRadius * c;
  return distance;
}

function degToRad(degrees) {
  return degrees * (Math.PI / 180);
}

server.listen(process.env.PORT ? process.env.PORT : 3000, () => {
  console.log(
    "Server is running on port",
    process.env.PORT ? process.env.PORT : 3000
  );
});
