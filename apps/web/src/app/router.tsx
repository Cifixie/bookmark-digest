import { createBrowserRouter } from "react-router-dom";
import Home from "./page";
import DigestsPage from "./digests/page";
import DigestPageClient from "./digests/[digestId]/DigestPageClient";
import App from "./App";

const routes = [
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: "digests", element: <DigestsPage /> },
      { path: "digests/:digestId", element: <DigestPageClient /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
