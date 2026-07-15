import { createRoot } from "react-dom/client";
import App from "./App";
import { configureApiClient } from "@/lib/api";
import "./index.css";

// Before render: services may fire during module init (e.g. Shopify embedded
// session bootstrap), so the API client must already be configured.
configureApiClient();

createRoot(document.getElementById("root")!).render(<App />);
