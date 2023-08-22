import styles from "./BudgetInfo.module.css";
import { useSelector, useDispatch } from "react-redux";
import { budgetActions } from "../../../state/slices/budgetSlice";

const BudgetInfo = () => {
	const budgetState = useSelector((state: any) => state.budget);
	const dispatch = useDispatch();
	const { setBudgetInfo } = budgetActions

	const slideBack = () => {
		dispatch(setBudgetInfo(null));
	}

	return (
		<main className={styles.BudgetInfo} style={{translate: budgetState.budgetInfo ? "0 0" : "100% 0"}}>
			<h1>Budget Info</h1>
			<button onClick={slideBack}>exit</button>
		</main>
	);
};

export default BudgetInfo;
