import React from "react";
import ReactDOM from "react-dom/client";
import "./reset.css";
import {
	createBrowserRouter,
	RouterProvider,
	Outlet,
	ScrollRestoration,
} from "react-router-dom";
import { Provider } from "react-redux";
import store from "./state/store";
import NavBar from "./components/NavBar/NavBar";
import Budget from "./pages/budget/Budget";
import Transactions from "./pages/transactions/Transactions";
import BudgetInfo from "./pages/budget/BudgetInfo/BudgetInfo";

const router = createBrowserRouter([
	{
		path: "/",
		element: (
			<>
				<BudgetInfo />
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
		<Provider store={store}>
			<RouterProvider router={router} />
		</Provider>
	</React.StrictMode>
);
