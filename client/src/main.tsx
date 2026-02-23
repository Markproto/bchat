import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import BchatApp from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BchatApp />
  </StrictMode>
);
