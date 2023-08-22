import { getBudgetsFn, addBudgetItemFn } from "../controllers/budgets";

export const routes = (app: any) => {
	// Budget
	app.get("/getBudgets", getBudgetsFn);
	app.post("/addBudgetItem", addBudgetItemFn);
};
