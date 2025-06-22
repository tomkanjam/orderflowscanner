import { initializeApp } from "firebase/app";
import { getAI, VertexAIBackend } from "firebase/ai";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAZQHIsU9UygNUaLClXRek4RKz55dEljbY",
  authDomain: "trademind-460817.firebaseapp.com",
  projectId: "trademind-460817",
  storageBucket: "trademind-460817.firebasestorage.app",
  messagingSenderId: "502360183867",
  appId: "1:502360183867:web:d38a692993e521b40bf81e",
  measurementId: "G-Q0R8BH6WHM"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Initialize the AI service with Vertex AI backend
// This uses your Google Cloud project billing (no separate API key needed)
export const ai = getAI(app, { backend: new VertexAIBackend() });