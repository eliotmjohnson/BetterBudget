import styles from "./Budget.module.css";
import Header from "./Header/Header";
import BudgetSection from "./BudgetSection/BudgetSection";
import axios from "axios";
import { useState, useEffect } from "react";
import { useSelector } from "react-redux";

const Budget = () => {
	const [budget, setBudget] = useState<[]>();
	const [refresh, setRefresh] = useState(false);
	const budgetState = useSelector((state: any) => state.budget)

	useEffect(() => {
		const getBudgets = async () => {
			const data = await axios.get("/getBudgets");

			setBudget(data.data);
		};

		getBudgets();
	}, [refresh]);

	return (
		<main
			className={styles.Dashboard}
			style={{ translate: budgetState.budgetInfo ? "-100% 0" : "0 0" }}
		>
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
