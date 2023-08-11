import styles from "./BudgetSection.module.css";
import BudgetItem from "./BudgetItem/BudgetItem";
import { useState, useRef } from "react";
import axios from "axios";

const BudgetSection = ({
	id,
	name,
	budgets,
	setRefresh,
}: {
	id: number;
	name: string;
	budgets: {
		name: string;
		planned_amount: number;
		fund: boolean;
	}[];
	setRefresh: any;
}) => {
	const timeout = useRef<any>();
	const [addItem, setAddItem] = useState(false);
	const [formattedNumber, setFormattedNumber] = useState("");

	const createItem = () => {
		setAddItem((prev) => {
			return true;
		});
		setFormattedNumber((prev) => {
			return "";
		});
	};

	const formatNumber = (e: React.FormEvent<HTMLInputElement>) => {
		e.preventDefault();

		const value: string = e.currentTarget.value;

		const cleaned = value.replace(/\D/g, "").replace(/^0+/, "");

		setFormattedNumber((prev) => {
			if (cleaned.length === 0) {
				return "";
			} else if (cleaned.length === 1) {
				return `$0.0${cleaned}`;
			} else if (cleaned.length === 2) {
				return `$0.${cleaned}`;
			} else if (cleaned.length >= 9) {
				const cleanArr = cleaned.split("");
				cleanArr.splice(cleaned.length - 2, 0, ".");
				cleanArr.splice(0, 0, "$");
				cleanArr.splice(cleaned.length - 4, 0, ",");
				cleanArr.splice(cleaned.length - 7, 0, ",");
				const cleanArrJoined = cleanArr.join("");
				return cleanArrJoined;
			} else if (cleaned.length >= 6) {
				const cleanArr = cleaned.split("");
				cleanArr.splice(cleaned.length - 2, 0, ".");
				cleanArr.splice(0, 0, "$");
				cleanArr.splice(cleaned.length - 4, 0, ",");
				const cleanArrJoined = cleanArr.join("");
				return cleanArrJoined;
			} else {
				const cleanArr = cleaned.split("");
				cleanArr.splice(cleaned.length - 2, 0, ".");
				cleanArr.splice(0, 0, "$");
				const cleanArrJoined = cleanArr.join("");
				return cleanArrJoined;
			}
		});
	};

	const handleSubmit = (e: React.FocusEvent<HTMLFormElement>) => {
		e.preventDefault();

		timeout.current = setTimeout(async () => {
			const data = {
				name: e.target.form[0].value,
				amount: +e.target.form[1].value.replace(/[^0-9.-]+/g, ""),
				fund: false,
				budgetId: id,
			};

			if (data.amount === 0 || data.name === "") {
				return setAddItem(false);
			}

			await axios.post("/addBudgetItem", data);

			setAddItem(false);
			setRefresh((prev: boolean) => {
				return !prev;
			});
		}, 5);
	};

	const clearT = () => {
		clearTimeout(timeout.current);
	};

	return (
		<div className={styles.BudgetSection}>
			<div className={styles.title}>
				<h1>{name}</h1>
				<p>Planned</p>
			</div>
			<section className={styles.categories}>
				{budgets[0] === null
					? undefined
					: budgets.map((item) => {
							return (
								<BudgetItem
									key={item.name}
									name={item.name}
									amount={item.planned_amount}
									fund={item.fund}
								/>
							);
					  })}
				<span className={styles.addItem} onClick={createItem}>
					{addItem ? (
						<form onBlur={handleSubmit} className={styles.inputs}>
							<input
								className={styles.leftInput}
								placeholder="Item Name"
								type="text"
								maxLength={20}
								onFocus={clearT}
							/>
							<input
								className={styles.rightInput}
								placeholder="$0.00"
								type="text"
								maxLength={12}
								pattern="[0-9]*"
								onChange={formatNumber}
								value={formattedNumber}
								onFocus={clearT}
							/>
						</form>
					) : (
						<h1>Add Item</h1>
					)}
				</span>
			</section>
		</div>
	);
};

export default BudgetSection;
