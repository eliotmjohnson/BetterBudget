import styles from "./Header.module.css";
import NavBar from "./NavBar/NavBar";

const Header = () => {
	return (
		<div className={styles.header}>
			<span className={styles.dateBar}>
				<div>
					<h1>July</h1>
					<h2>
						2023
						<img src="/images/icons/icons8-arrow-100.png" />
					</h2>
				</div>
				<h3>+</h3>
			</span>
			<NavBar />
		</div>
	);
};

export default Header;
