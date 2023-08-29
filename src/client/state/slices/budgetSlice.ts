import { createSlice } from "@reduxjs/toolkit";

const initialState = {
	budgetData: [],
	budgetInfo: false,
};

const budgetSlice = createSlice({
	name: "budget",
	initialState: initialState,
	reducers: {
		setBudgetInfo: (state, action) => {
			state.budgetInfo = !state.budgetInfo;
		},
	},
});

export const budgetActions = budgetSlice.actions;

export default budgetSlice.reducer;