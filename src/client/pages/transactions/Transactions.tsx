import styles from "./Transactions.module.css";
import { useState, useEffect } from "react";

const Transactions = () => {
	const [items, setItems] = useState(["1", "2", "3", "6", "5"]);
	const [dragged, setDragged] = useState<number | null>(null);
	const [mouse, setMouse] = useState<[number, number]>([0, 0]);
	const [dropZone, setDropZone] = useState(0);

	useEffect(() => {
		const handler = (e: MouseEvent) => {
			setMouse([e.x, e.y]);
		};

		document.addEventListener("mousemove", handler);

		return () => {
			document.removeEventListener("mousemove", handler);
		};
	}, []);

	useEffect(() => {
		if (dragged !== null) {
			const elements = Array.from(document.querySelectorAll("#dropZone"));

			const positions = elements.map((elem) => {
				return elem.getBoundingClientRect().top;
			});

			const absDifferences = positions.map((v) => {
				return Math.abs(v - mouse[1]);
			});

			let result = absDifferences.indexOf(Math.min(...absDifferences));

			if (result > dragged) {
				result += 1;
			}

			setDropZone(result);
		}
	}, [dragged, mouse]);

	useEffect(() => {
		const reorderList = <T,>(l: T[], start: number, end: number) => {
			const temp = l[start];

			for (let i = start; i < end; i++) {
				l[i] = l[i + 1];
			}
			l[end - 1] = temp;

			return l;
		};

		const handler = (e: MouseEvent) => {
			if (dragged !== null) {
				e.preventDefault();
				setDragged(null);

				setItems((items) => {
					return reorderList([...items], dragged, dropZone)
				})
			}
		};

		document.addEventListener("mouseup", handler);

		return () => document.removeEventListener("mouseup", handler);
	});

	return (
		<div className={styles.doc}>
			{dragged !== null ? (
				<li
					style={{
						left: `${mouse[0]}px`,
						top: `${mouse[1]}px`,
					}}
					className={`${styles.floating} ${styles.listItem}`}
				>
					{items[dragged]}
				</li>
			) : undefined}
			<ul className={styles.list}>
				<div
					id="dropZone"
					className={`${styles.listItem} ${styles.dropZone} ${
						dragged === null || dropZone !== 0 ? styles.hidden : ""
					}`}
				/>
				{items.map((item, index) => {
					return (
						<>
							{dragged !== index ? (
								<>
									<li
										className={styles.listItem}
										onTouchStart={(e) => {
											e.preventDefault();
											setDragged(index);
										}}
										key={index}
									>
										{item}
									</li>
									<div
										id="dropZone"
										className={`${styles.listItem} ${styles.dropZone} ${
											dragged === null || dropZone !== index + 1
												? styles.hidden
												: ""
										}`}
									/>
								</>
							) : undefined}
						</>
					);
				})}
			</ul>
		</div>
	);
};

export default Transactions;
