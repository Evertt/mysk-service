// Loaded before every component test (the `client` project in vite.config.ts).

// The app's styles, so components are laid out, hidden and shown as in the app.
import "./routes/layout.css";

// Keeps components off the edge of the test frame, where clicks don't reach them.
document.body.style.padding = "1rem";
