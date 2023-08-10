import { sequelize } from "../database/database";

export const getBudgetsFn = async (req: any, res: any) => {
	const data = await sequelize.query(`
        SELECT budgets.*, jsonb_agg(budget_categories.*) AS categories
        FROM budgets
        LEFT JOIN budget_categories
        ON budgets.id = budget_categories.budget_id
        GROUP BY budgets.id;
    `);

	return res.status(200).send(data[0]);
};

export const addBudgetItemFn = async (req: any, res: any) => {
	const { name, amount, fund, budgetId } = req.body;

	try {
		await sequelize.query(`
        INSERT INTO budget_categories (
            name,
            fund,
            planned_amount,
            budget_id
        )
        VALUES (
            '${name}',
            '${fund}',
            ${amount},
            ${budgetId}
        );
    `);
		return res.sendStatus(200);
	} catch (error) {
		console.log(error);
		return res.sendStatus(400);
	}
};
