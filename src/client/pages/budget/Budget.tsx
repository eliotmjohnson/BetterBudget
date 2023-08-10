import styles from "./Budget.module.css";
import Header from "./Header/Header";
import BudgetSection from "./BudgetSection/BudgetSection";
import axios from "axios";
import { useState, useEffect } from "react";

const Budget = () => {
	const [budget, setBudget] = useState<[]>();
	const [refresh, setRefresh] = useState(false);

	useEffect(() => {
		const getBudgets = async () => {
			const data = await axios.get("/getBudgets");

			setBudget(data.data);
		};

		getBudgets();
	}, [refresh]);

	return (
		<main className={styles.Dashboard}>
			<Header />
			<section className={styles.dashPage}>
				{budget ? (
					budget.map(
						(section: { id: number; budget_name: string; categories: [] }) => {
							return (
								<BudgetSection
									id={section.id}
									key={section.budget_name}
									name={section.budget_name}
									budgets={section.categories}
									setRefresh={setRefresh}
								/>
							);
						}
					)
				) : (
					<h1>Loading...</h1>
				)}
			</section>
		</main>
	);
};

export default Budget;
