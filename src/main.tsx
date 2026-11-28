import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./Root";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

import "./catalog.css";
import "./trips.css";
import "./commuter.css";

import "./refresh.css";


import "./mobile-ride.css";
import "./polish.css";
