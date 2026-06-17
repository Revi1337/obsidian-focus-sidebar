import { Plugin, WorkspaceLeaf, WorkspaceSplit, WorkspaceItem, MarkdownView } from 'obsidian';

// Augment the official Obsidian interfaces to include properties that exist at runtime but aren't in obsidian.d.ts
declare module 'obsidian' {
	interface WorkspaceSplit {
		collapsed: boolean;
		expand(): void;
		containerEl: HTMLElement;
		children: WorkspaceItem[];
	}
}

interface WorkspaceTabGroup {
	type: 'tabs';
	currentTab: number;
	children: WorkspaceLeaf[];
}

export default class FocusSidebarPlugin extends Plugin {
	// Track the last active leaf in each sidebar and editor
	lastLeftActiveLeaf: WorkspaceLeaf | null = null;
	lastRightActiveLeaf: WorkspaceLeaf | null = null;
	lastActiveEditorLeaf: WorkspaceLeaf | null = null;

	async onload() {
		// Track active leaf change to record the last active tab in each sidebar and the center editor
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				if (!leaf || !leaf.view || !leaf.view.containerEl) return;

				const leftSplit = this.app.workspace.leftSplit as WorkspaceSplit;
				const rightSplit = this.app.workspace.rightSplit as WorkspaceSplit;

				// In recent Obsidian versions, leaf.getRoot() returns WorkspaceParent
				const root = typeof leaf.getRoot === 'function' ? leaf.getRoot() : null;

				const isInLeft = root === leftSplit || (leftSplit && leftSplit.containerEl && leftSplit.containerEl.contains(leaf.view.containerEl));
				const isInRight = root === rightSplit || (rightSplit && rightSplit.containerEl && rightSplit.containerEl.contains(leaf.view.containerEl));

				if (isInLeft) {
					this.lastLeftActiveLeaf = leaf;
				} else if (isInRight) {
					this.lastRightActiveLeaf = leaf;
				} else {
					this.lastActiveEditorLeaf = leaf;
				}
			})
		);

		// 1. Focus on left sidebar (basic)
		this.addCommand({
			id: 'focus-left-sidebar',
			name: 'Focus on left sidebar',
			callback: () => {
				this.focusSidebarBasic(this.app.workspace.leftSplit as WorkspaceSplit);
			}
		});

		// 2. Focus on right sidebar (basic)
		this.addCommand({
			id: 'focus-right-sidebar',
			name: 'Focus on right sidebar',
			callback: () => {
				this.focusSidebarBasic(this.app.workspace.rightSplit as WorkspaceSplit);
			}
		});

		// 3. Focus on left sidebar (last position)
		this.addCommand({
			id: 'focus-left-sidebar-last-pos',
			name: 'Focus on left sidebar (last position)',
			callback: () => {
				this.focusSidebarLastPos(this.app.workspace.leftSplit as WorkspaceSplit, 'left');
			}
		});

		// 4. Focus on right sidebar (last position)
		this.addCommand({
			id: 'focus-right-sidebar-last-pos',
			name: 'Focus on right sidebar (last position)',
			callback: () => {
				this.focusSidebarLastPos(this.app.workspace.rightSplit as WorkspaceSplit, 'right');
			}
		});

		// 5. Toggle focus between editor and left sidebar (last position)
		this.addCommand({
			id: 'toggle-focus-left-sidebar-last-pos',
			name: 'Toggle focus between editor and left sidebar (last position)',
			callback: () => {
				this.toggleFocusSidebar(this.app.workspace.leftSplit as WorkspaceSplit, 'left');
			}
		});

		// 6. Toggle focus between editor and right sidebar (last position)
		this.addCommand({
			id: 'toggle-focus-right-sidebar-last-pos',
			name: 'Toggle focus between editor and right sidebar (last position)',
			callback: () => {
				this.toggleFocusSidebar(this.app.workspace.rightSplit as WorkspaceSplit, 'right');
			}
		});
	}

	onunload() {}

	// Basic focus (activates the currently visible tab and focuses its container)
	focusSidebarBasic(split: WorkspaceSplit | null) {
		if (!split) return;
		if (split.collapsed) {
			split.expand();
		}

		const leaf = this.getActiveTabOfSplit(split);
		if (leaf) {
			this.app.workspace.setActiveLeaf(leaf, { focus: true });
			window.setTimeout(() => {
				if (leaf.view && leaf.view.containerEl) {
					leaf.view.containerEl.focus();
				}
			}, 50);
		}
	}

	// Last position focus (restores the last active tab and targets sub-elements)
	focusSidebarLastPos(split: WorkspaceSplit | null, direction: 'left' | 'right') {
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
			window.setTimeout(() => {
				this.focusLeafSmart(leaf);
			}, 50);
		}
	}

	// Toggle focus on sidebar: if already focused, return to editor; else focus sidebar
	toggleFocusSidebar(split: WorkspaceSplit | null, direction: 'left' | 'right') {
		if (!split) return;

		const activeEl = activeDocument.activeElement;
		const isFocusedInSidebar = split.containerEl && split.containerEl.contains(activeEl);

		if (isFocusedInSidebar) {
			this.focusEditor();
		} else {
			this.focusSidebarLastPos(split, direction);
		}
	}

	// Focus back on the last active editor leaf (or find first editor tab)
	focusEditor() {
		let leaf = this.lastActiveEditorLeaf;

		// Verify the leaf is still valid and connected to the document
		if (!leaf || !leaf.view || !leaf.view.containerEl || !activeDocument.body.contains(leaf.view.containerEl)) {
			const leftSplit = this.app.workspace.leftSplit as WorkspaceSplit;
			const rightSplit = this.app.workspace.rightSplit as WorkspaceSplit;
			
			this.app.workspace.iterateAllLeaves((l) => {
				if (!leaf) {
					const root = typeof l.getRoot === 'function' ? l.getRoot() : null;
					const isInLeft = root === leftSplit || (leftSplit && leftSplit.containerEl && leftSplit.containerEl.contains(l.view.containerEl));
					const isInRight = root === rightSplit || (rightSplit && rightSplit.containerEl && rightSplit.containerEl.contains(l.view.containerEl));
					
					if (!isInLeft && !isInRight) {
						leaf = l;
					}
				}
			});
		}

		if (leaf) {
			this.app.workspace.setActiveLeaf(leaf, { focus: true });
			window.setTimeout(() => {
				if (leaf && leaf.view) {
					if (leaf.view instanceof MarkdownView) {
						const mdView = leaf.view as unknown as { editor: { focus: () => void } };
						if (mdView && mdView.editor && typeof mdView.editor.focus === 'function') {
							mdView.editor.focus();
						}
					} else {
						const view = leaf.view as unknown as { focus?: () => void };
						if (typeof view.focus === 'function') {
							view.focus();
						} else if (leaf.view.containerEl) {
							leaf.view.containerEl.focus();
						}
					}
				}
			}, 50);
		}
	}

	// Finds the active (currently visible) tab inside the split
	getActiveTabOfSplit(split: WorkspaceSplit): WorkspaceLeaf | null {
		if (!split || !split.children) return null;

		for (const child of split.children) {
			const tabGroup = child as unknown as WorkspaceTabGroup;
			if (tabGroup && tabGroup.type === 'tabs') {
				const currentTabIdx = tabGroup.currentTab;
				if (tabGroup.children && tabGroup.children[currentTabIdx]) {
					return tabGroup.children[currentTabIdx];
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
					fallbackLeaf = l;
				}
			}
		});
		return fallbackLeaf;
	}

	// Validates whether the leaf is still valid and inside the split
	isLeafValid(leaf: WorkspaceLeaf, split: WorkspaceSplit): boolean {
		if (!leaf || !leaf.view || !leaf.view.containerEl) return false;
		if (!activeDocument.body.contains(leaf.view.containerEl)) return false;

		const root = typeof leaf.getRoot === 'function' ? leaf.getRoot() : null;
		return root === split || (split.containerEl && split.containerEl.contains(leaf.view.containerEl));
	}

	// Smartly focus on sub-elements (inputs, tree items) inside the leaf container
	focusLeafSmart(leaf: WorkspaceLeaf) {
		if (!leaf || !leaf.view || !leaf.view.containerEl) return;

		const container = leaf.view.containerEl;

		// 1. Focus active tree item (.is-active)
		const activeTreeItem = container.querySelector('.is-active, .tree-item-self.is-active, .nav-file-title.is-active');
		if (activeTreeItem instanceof HTMLElement) {
			activeTreeItem.focus();
			return;
		}

		// 2. Focus input fields (e.g. search box)
		const inputEl = container.querySelector('input[type="search"], input[type="text"], input, textarea, [contenteditable="true"]');
		if (inputEl instanceof HTMLInputElement || inputEl instanceof HTMLTextAreaElement) {
			inputEl.focus();
			inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
			return;
		} else if (inputEl instanceof HTMLElement && inputEl.isContentEditable) {
			inputEl.focus();
			return;
		}

		// 3. Focus first tree item if nothing else is active
		const treeItem = container.querySelector('.tree-item-self, .nav-file-title, .nav-folder-title');
		if (treeItem instanceof HTMLElement) {
			treeItem.focus();
			return;
		}

		// 4. Default fallback
		container.focus();
	}
}
