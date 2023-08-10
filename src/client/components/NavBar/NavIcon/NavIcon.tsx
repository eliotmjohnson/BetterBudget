import styles from "./NavIcon.module.css";
import { useNavigate } from "react-router-dom";

const NavIcon = ({
	src,
	name,
	active,
}: {
	src: string;
	name: string;
	active: boolean;
}) => {
	const navigate = useNavigate();

	const navigateTo = () => {
		if (name === "Budget") {
			navigate("/");
		} else if (name === "Transactions") {
			navigate("/transactions");
		}
	};

	return (
		<div tabIndex={0} className={styles.navIcon} onClick={navigateTo}>
			<img className={`${active ? styles.active : undefined}`} src={src} />
			<h3 className={`${active ? styles.active : undefined}`}>{name}</h3>
		</div>
	);
};

export default NavIcon;
