import styles from "./BudgetItem.module.css";
import { budgetActions } from "../../../../state/slices/budgetSlice";
import { useDispatch } from "react-redux";

const BudgetItem = ({
	name,
	amount,
	fund,
}: {
	name: string;
	amount: number;
	fund: boolean;
}) => {
	const dispatch = useDispatch();
	const { setBudgetInfo } = budgetActions;
	const formattedNumber = amount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, "$&,");

	const slide = (e: any) => {
		e.preventDefault();
		dispatch(setBudgetInfo(null));
	};

	return (
		<span className={styles.BudgetItem} onClick={slide}>
			<span className={styles.title}>
				{fund ? (
					<img src="/images/icons/icons8-money-box-96.png"></img>
				) : undefined}
				<h2>{name}</h2>
			</span>
			<div className={styles.amount}>
				<strong>$</strong>
				<p>{formattedNumber}</p>
			</div>
		</span>
	);
};

export default BudgetItem;
