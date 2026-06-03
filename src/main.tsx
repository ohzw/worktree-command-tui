import React from 'react';
import {render} from 'ink';
import {App} from './app.js';
import {buildActions, buildInitialModel} from './core/runtime.js';
import {APP_RENDER_OPTIONS} from './render-options.js';

const cwd = process.cwd();
const [initialModel, actions] = await Promise.all([buildInitialModel(cwd), buildActions(cwd)]);

render(<App initialModel={initialModel} actions={actions} />, APP_RENDER_OPTIONS);
