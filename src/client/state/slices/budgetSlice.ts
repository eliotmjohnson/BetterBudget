import { createSlice } from "@reduxjs/toolkit";

const initialState = {
	budgetData: []
};

const budgetSlice = createSlice({
	name: "budget",
	initialState: initialState,
	reducers: {
		
	},
});

export const budgetActions = budgetSlice.actions;

export default budgetSlice.reducer;
