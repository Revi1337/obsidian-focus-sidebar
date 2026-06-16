import { Plugin, WorkspaceLeaf } from 'obsidian';

export default class FocusSidebarPlugin extends Plugin {
	// Track the last active leaf in each sidebar
	lastLeftActiveLeaf: WorkspaceLeaf | null = null;
	lastRightActiveLeaf: WorkspaceLeaf | null = null;

	async onload() {
		// Track active leaf change to record the last active tab in each sidebar
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				if (!leaf || !leaf.view || !leaf.view.containerEl) return;

				const leftSplit = this.app.workspace.leftSplit as any;
				const rightSplit = this.app.workspace.rightSplit as any;

				// In recent Obsidian versions, leaf.getRoot() returns WorkspaceParent
				const root = typeof leaf.getRoot === 'function' ? leaf.getRoot() : null;

				const isInLeft = root === leftSplit || (leftSplit && leftSplit.containerEl && leftSplit.containerEl.contains(leaf.view.containerEl));
				const isInRight = root === rightSplit || (rightSplit && rightSplit.containerEl && rightSplit.containerEl.contains(leaf.view.containerEl));

				if (isInLeft) {
					this.lastLeftActiveLeaf = leaf;
				} else if (isInRight) {
					this.lastRightActiveLeaf = leaf;
				}
			})
		);

		// 1. Focus on left sidebar (basic)
		this.addCommand({
			id: 'focus-left-sidebar',
			name: 'Focus on left sidebar',
			callback: () => {
				this.focusSidebarBasic(this.app.workspace.leftSplit);
			}
		});

		// 2. Focus on right sidebar (basic)
		this.addCommand({
			id: 'focus-right-sidebar',
			name: 'Focus on right sidebar',
			callback: () => {
				this.focusSidebarBasic(this.app.workspace.rightSplit);
			}
		});

		// 3. Focus on left sidebar (last position)
		this.addCommand({
			id: 'focus-left-sidebar-last-pos',
			name: 'Focus on left sidebar (last position)',
			callback: () => {
				this.focusSidebarLastPos(this.app.workspace.leftSplit, 'left');
			}
		});

		// 4. Focus on right sidebar (last position)
		this.addCommand({
			id: 'focus-right-sidebar-last-pos',
			name: 'Focus on right sidebar (last position)',
			callback: () => {
				this.focusSidebarLastPos(this.app.workspace.rightSplit, 'right');
			}
		});
	}

	onunload() {}

	// Basic focus (activates the currently visible tab and focuses its container)
	focusSidebarBasic(split: any) {
		if (!split) return;
		if (split.collapsed) {
			split.expand();
		}

		const leaf = this.getActiveTabOfSplit(split);
		if (leaf) {
			this.app.workspace.setActiveLeaf(leaf, { focus: true });
			setTimeout(() => {
				if (leaf.view && leaf.view.containerEl) {
					(leaf.view.containerEl as HTMLElement).focus();
				}
			}, 50);
		}
	}

	// Last position focus (restores the last active tab and targets sub-elements)
	focusSidebarLastPos(split: any, direction: 'left' | 'right') {
		if (!split) return;
		if (split.collapsed) {
			split.expand();
		}

		let leaf = direction === 'left' ? this.lastLeftActiveLeaf : this.lastRightActiveLeaf;

		if (!leaf || !this.isLeafValid(leaf, split)) {
			leaf = this.getActiveTabOfSplit(split);
		}

		if (leaf) {
			this.app.workspace.setActiveLeaf(leaf, { focus: true });
			setTimeout(() => {
				this.focusLeafSmart(leaf);
			}, 50);
		}
	}

	// Finds the active (currently visible) tab inside the split
	getActiveTabOfSplit(split: any): WorkspaceLeaf | null {
		if (!split || !split.children) return null;

		for (const child of split.children) {
			if ((child as any).type === 'tabs') {
				const currentTabIdx = (child as any).currentTab;
				if (child.children && child.children[currentTabIdx]) {
					return child.children[currentTabIdx] as WorkspaceLeaf;
				}
			}
		}

		// Fallback: find the first leaf in this split
		let fallbackLeaf: WorkspaceLeaf | null = null;
		this.app.workspace.iterateAllLeaves((l) => {
			if (!fallbackLeaf) {
				const root = typeof l.getRoot === 'function' ? l.getRoot() : null;
				const isMine = root === split || (split.containerEl && l.view && l.view.containerEl && split.containerEl.contains(l.view.containerEl));
				if (isMine) {
					fallbackLeaf = l as WorkspaceLeaf;
				}
			}
		});
		return fallbackLeaf;
	}

	// Validates whether the leaf is still valid and inside the split
	isLeafValid(leaf: WorkspaceLeaf, split: any): boolean {
		if (!leaf || !leaf.view || !leaf.view.containerEl) return false;
		if (!document.body.contains(leaf.view.containerEl)) return false;

		const root = typeof leaf.getRoot === 'function' ? leaf.getRoot() : null;
		return root === split || (split.containerEl && split.containerEl.contains(leaf.view.containerEl));
	}

	// Smartly focus on sub-elements (inputs, tree items) inside the leaf container
	focusLeafSmart(leaf: WorkspaceLeaf) {
		if (!leaf || !leaf.view || !leaf.view.containerEl) return;

		const container = leaf.view.containerEl as HTMLElement;

		// 1. Focus active tree item (.is-active)
		const activeTreeItem = container.querySelector('.is-active, .tree-item-self.is-active, .nav-file-title.is-active') as HTMLElement;
		if (activeTreeItem) {
			activeTreeItem.focus();
			return;
		}

		// 2. Focus input fields (e.g. search box)
		const inputEl = container.querySelector('input[type="search"], input[type="text"], input, textarea, [contenteditable="true"]') as HTMLInputElement;
		if (inputEl) {
			inputEl.focus();
			if (typeof inputEl.selectionStart === 'number') {
				inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
			}
			return;
		}

		// 3. Focus first tree item if nothing else is active
		const treeItem = container.querySelector('.tree-item-self, .nav-file-title, .nav-folder-title') as HTMLElement;
		if (treeItem) {
			(treeItem as HTMLElement).focus();
			return;
		}

		// 4. Default fallback
		container.focus();
	}
}
