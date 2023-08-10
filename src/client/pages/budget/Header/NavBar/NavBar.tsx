import styles from "./NavBar.module.css";
import { useState, MouseEvent } from "react";

const NavBar = () => {
	const [selector, setSelector] = useState("0%");

	const moveSelector = (e: MouseEvent<HTMLDivElement>) => {
		e.preventDefault();

		if (e.currentTarget.id === "planned") {
			setSelector((prev) => {
				return "0%";
			});
		} else if (e.currentTarget.id === "spent") {
			setSelector((prev) => {
				return "100%";
			});
		} else if (e.currentTarget.id === "remaining") {
			setSelector((prev) => {
				return "200.5%";
			});
		}
	};

	return (
		<span className={styles.NavBar}>
			<div id="planned" onClick={moveSelector}>
				Planned
			</div>
			<div id="spent" onClick={moveSelector}>
				Spent
			</div>
			<div id="remaining" onClick={moveSelector}>
				Remaining
			</div>
			<span className={styles.selector} style={{ translate: selector }}></span>
		</span>
	);
};

export default NavBar;
