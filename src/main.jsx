import React from "react";
import { createRoot } from "react-dom/client";
import GeekAI from "../procurement-agent.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <GeekAI />
  </React.StrictMode>
);
