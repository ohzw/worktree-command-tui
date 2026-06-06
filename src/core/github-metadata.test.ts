import {describe, expect, it} from 'vitest';
import {isGitHubMetadataHostAllowed, normalizePullRequestUrlForRepository, type GitHubRepository} from './github-metadata.js';

const repository: GitHubRepository = {
	host: 'github.com',
	owner: 'acme',
	name: 'worktree-command-tui',
};

describe('isGitHubMetadataHostAllowed', () => {
	it('allows public GitHub hosts but blocks arbitrary remote hosts by default', () => {
		expect(isGitHubMetadataHostAllowed('github.com')).toBe(true);
		expect(isGitHubMetadataHostAllowed('www.github.com')).toBe(false);
		expect(isGitHubMetadataHostAllowed('github.evil.test')).toBe(false);
	});
});

describe('normalizePullRequestUrlForRepository', () => {
	it('keeps HTTPS PR URLs on the repository host', () => {
		expect(normalizePullRequestUrlForRepository('https://github.com/acme/worktree-command-tui/pull/42', repository, 42)).toBe('https://github.com/acme/worktree-command-tui/pull/42');
	});

	it('rejects non-HTTPS, custom-scheme, and host-mismatched PR URLs', () => {
		expect(normalizePullRequestUrlForRepository('http://github.com/acme/worktree-command-tui/pull/42', repository, 42)).toBeNull();
		expect(normalizePullRequestUrlForRepository('vscode://file/tmp/worktree', repository, 42)).toBeNull();
		expect(normalizePullRequestUrlForRepository('https://evil.test/acme/worktree-command-tui/pull/42', repository, 42)).toBeNull();
		expect(normalizePullRequestUrlForRepository('https://github.com/evil/worktree-command-tui/pull/42', repository, 42)).toBeNull();
		expect(normalizePullRequestUrlForRepository('https://github.com/acme/worktree-command-tui/issues/42', repository, 42)).toBeNull();
		expect(normalizePullRequestUrlForRepository('https://github.com/acme/worktree-command-tui/pull/42?tab=files', repository, 42)).toBeNull();
	});
});
