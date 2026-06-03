import React, {useEffect, useRef, useState} from 'react';
import {Box, useApp, useInput} from 'ink';
import {Header} from './components/Header.js';
import {WorktreeList} from './components/WorktreeList.js';
import {Footer} from './components/Footer.js';
import {StatusBar} from './components/StatusBar.js';
import type {AppActions, AppModel} from './core/runtime.js';

export function App({initialModel, actions}: {initialModel: AppModel; actions: AppActions}) {
	const {exit} = useApp();
	const [model, setModel] = useState(initialModel);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const inFlightRef = useRef(false);

	useEffect(() => {
		setSelectedIndex(index => {
			if (model.rows.length === 0) {
				return 0;
			}
			return Math.min(index, model.rows.length - 1);
		});
	}, [model.rows.length]);

	const selected = model.rows[selectedIndex];

	async function apply(action: () => Promise<AppModel>) {
		inFlightRef.current = true;
		try {
			const next = await action();
			setModel(next);
		} catch (error) {
			setModel(current => ({
				...current,
				status: {
					kind: 'error',
					message: error instanceof Error ? error.message : String(error),
				},
			}));
		} finally {
			inFlightRef.current = false;
		}
	}

	useInput((input, key) => {
		if (key.escape || input === 'q') {
			exit();
			return;
		}
		if (key.upArrow) {
			setSelectedIndex(index => Math.max(0, index - 1));
			return;
		}
		if (key.downArrow) {
			setSelectedIndex(index => Math.min(Math.max(model.rows.length - 1, 0), index + 1));
			return;
		}
		if (inFlightRef.current) {
			return;
		}
		if (key.return && selected) {
			if (selected.invalidReason) {
				setModel(current => ({...current, status: {kind: 'error', message: selected.invalidReason!}}));
				return;
			}
			if (selected.path === model.activePath) {
				setModel(current => ({...current, status: {kind: 'idle', message: 'already active'}}));
				return;
			}
			setModel(current => ({...current, status: {kind: 'starting', message: `Starting ${selected.branch}...`}}));
			void apply(() => actions.start(selected.path));
			return;
		}
		if (input === 's') {
			setModel(current => ({...current, status: {kind: 'stopping', message: 'Stopping active session...'}}));
			void apply(() => actions.stop());
			return;
		}
		if (input === 'r') {
			void apply(() => actions.refresh());
		}
	});

	return (
		<Box flexDirection="column">
			<Header repoName={model.repoName} namespace={model.namespace} activeBranch={model.activeBranch} activePath={model.activePath} />
			<WorktreeList rows={model.rows} selectedIndex={selectedIndex} />
			<StatusBar status={model.status} />
			<Footer />
		</Box>
	);
}
