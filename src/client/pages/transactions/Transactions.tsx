import styles from "./Transactions.module.css";
import { useCallback, useEffect, useRef, useState } from "react";

const Transactions = () => {
	const [isDragging, setIsDragging] = useState(false);
	const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const block = useRef<HTMLDivElement>(null);

	const updateMouse = useCallback(
		(e) => {
			setMousePos((prev) => {
				return {
					x: e.clientX - offset.x < 0 ? 0 : e.clientX - offset.x,
					y: e.clientY - offset.y < 0 ? 0 : e.clientY - offset.y,
				};
			});
		},
		[offset]
	);

	useEffect(() => {
		window.addEventListener("mouseup", () => {
			setIsDragging((prev) => {
				return false;
			});
		});

		if (isDragging) {
			window.addEventListener("mousemove", updateMouse);
			window.addEventListener("touchmove", updateMouse);
		} else if (!isDragging) {
			window.removeEventListener("mousemove", updateMouse);
			window.addEventListener("touchmove", updateMouse);
		}
	}, [isDragging]);

	return (
		<main className={styles.Transactions}>
			<div
				style={{
					top: mousePos.y,
					left: mousePos.x,
					scale: isDragging ? "2" : "1",
					boxShadow: isDragging
						? ".5rem .5rem 1.5rem .3rem gray"
						: ".2rem .2rem .2rem 0 gray",
				}}
				className={styles.test}
				onMouseDown={(e) => {
					setOffset((prev) => {
						return {
							x: e.clientX - block.current.getBoundingClientRect().x,
							y: e.clientY - block.current.getBoundingClientRect().y,
						};
					});
					setIsDragging(true);
				}}
				onTouchStart={(e) => {
					setOffset((prev) => {
						return {
							x: e.touches[0].clientX - block.current.getBoundingClientRect().x,
							y: e.touches[0].clientY - block.current.getBoundingClientRect().y,
						};
					});
					setIsDragging(true);
				}}
				ref={block}
			></div>
		</main>
	);
};

export default Transactions;
