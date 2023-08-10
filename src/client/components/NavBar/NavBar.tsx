import styles from "./NavBar.module.css";
import NavIcon from "./NavIcon/NavIcon";
import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

const NavBar = () => {
	const [budgetActive, setBudgetActive] = useState(false);
	const [transactionsActive, setTransactionsActive] = useState(false);
	const { pathname } = useLocation();

	useEffect(() => {
		if (pathname === "/") {
			setBudgetActive((prev) => {
				return true;
			});
			setTransactionsActive((prev) => {
				return false;
			});
		} else if (pathname === "/transactions") {
			setBudgetActive((prev) => {
				return false;
			});
			setTransactionsActive((prev) => {
				return true;
			});
		}
	}, [pathname]);

	return (
		<span className={styles.NavBar}>
			<NavIcon
				src="/images/icons/icons8-budget-100.png"
				name="Budget"
				active={budgetActive}
			/>
			<NavIcon
				src="/images/icons/icons8-dollar-sign-100.png"
				name="Transactions"
				active={transactionsActive}
			/>
		</span>
	);
};

export default NavBar;
