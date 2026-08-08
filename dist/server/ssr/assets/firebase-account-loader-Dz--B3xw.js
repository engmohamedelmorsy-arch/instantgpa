import { C as __toESM, y as require_react } from "../index.js";
//#region app/account/firebase-account-loader.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
function FirebaseAccountLoader() {
	(0, import_react.useEffect)(() => {
		let cancelled = false;
		let configScript = null;
		let accountScript = null;
		const loadAccount = () => {
			if (cancelled || document.querySelector("script[data-instantgpa-account=\"true\"]")) return;
			accountScript = document.createElement("script");
			accountScript.type = "module";
			accountScript.src = "/assets/firebase-account-page.js";
			accountScript.dataset.instantgpaAccount = "true";
			document.body.appendChild(accountScript);
		};
		if (window.INSTANTGPA_FIREBASE) loadAccount();
		else {
			configScript = document.createElement("script");
			configScript.src = "/firebase-config.js";
			configScript.dataset.instantgpaFirebaseConfig = "true";
			configScript.addEventListener("load", loadAccount, { once: true });
			document.body.appendChild(configScript);
		}
		return () => {
			cancelled = true;
			configScript?.removeEventListener("load", loadAccount);
		};
	}, []);
	return null;
}
//#endregion
export { FirebaseAccountLoader as default };
