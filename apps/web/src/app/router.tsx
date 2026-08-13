import { createBrowserRouter } from "react-router-dom";
import Home from "./page";
import DigestsPage from "./digests/page";
import DigestPageClient from "./digests/[digestId]/DigestPageClient";
import BrowsePage from "./browse/BrowsePage";
import SourcePageClient from "./sources/[contentHash]/SourcePageClient";
import App from "./App";

const routes = [
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: "browse", element: <BrowsePage /> },
      { path: "sources/:contentHash", element: <SourcePageClient /> },
      { path: "digests", element: <DigestsPage /> },
      { path: "digests/:digestId", element: <DigestPageClient /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
