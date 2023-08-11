import React from "react";
import ReactDOM from "react-dom/client";
import "./reset.css";
import {
	createBrowserRouter,
	RouterProvider,
	Outlet,
	ScrollRestoration,
} from "react-router-dom";
import NavBar from "./components/NavBar/NavBar";
import Budget from "./pages/budget/Budget";
import Transactions from "./pages/transactions/Transactions";

const router = createBrowserRouter([
	{
		path: "/",
		element: (
			<>
				<Outlet />
				<NavBar />
				<ScrollRestoration
				// getKey={(location, matches) => {
				// 	return location.pathname;
				// }}
				/>
			</>
		),
		children: [
			{
				index: true,
				element: <Budget />,
			},
			{
				path: "/transactions",
				element: <Transactions />,
			},
		],
	},
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<RouterProvider router={router} />
	</React.StrictMode>
);
