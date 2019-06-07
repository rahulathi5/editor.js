import SelectionUtils from '../selection';

import $ from '../dom';
import _ from '../utils';
import {API, InlineTool, SanitizerConfig, ToolConfig} from '../../../types';
import {Notifier, Toolbar} from '../../../types/api';

/**
 * Link Tool
 *
 * Inline Toolbar Tool
 *
 * Wrap selected text with <a> tag
 */
export default class LinkInlineTool implements InlineTool {

  /**
   * Sanitizer Rule
   * Leave <a> tags
   * @return {object}
   */
  static get sanitize(): SanitizerConfig {
    return {
      a: {
        href: true,
        target: '_blank',
        rel: 'nofollow',
      },
    } as SanitizerConfig;
  }

  /**
   * Set a shortcut
   */
  public get shortcut(): string {
    return 'CMD+K';
  }

  /**
   * Specifies Tool as Inline Toolbar Tool
   *
   * @return {boolean}
   */
  public static isInline = true;

  /**
   * Native Document's commands for link/unlink
   */
  private readonly commandLink: string = 'createLink';
  private readonly commandUnlink: string = 'unlink';

  /**
   * Enter key code
   */
  private readonly ENTER_KEY: number = 13;

  /**
   * Styles
   */
  private readonly CSS = {
    button: 'ce-inline-tool',
    buttonActive: 'ce-inline-tool--active',
    buttonModifier: 'ce-inline-tool--link',
    buttonUnlink: 'ce-inline-tool--unlink',
    input: 'ce-inline-tool-input',
    inputShowed: 'ce-inline-tool-input--showed',
    header: 'ce-inline-tool-header',
    div: 'ce-inline-tool-div',
    divShowed: 'ce-inline-tool-div--showed',
  };

  private pageLinks = [];

  private linkElements = [];

  /**
   * Elements
   */
  private nodes: {
    button: HTMLButtonElement;
    input: HTMLInputElement;
    header: HTMLHeadElement;
    div: HTMLDivElement;
    searchInput: HTMLInputElement;
    ul: HTMLUListElement
  } = {
    button: null,
    input: null,
    header: null,
    div: null,
    searchInput: null,
    ul: null,
  };

  /**
   * SelectionUtils instance
   */
  private selection: SelectionUtils;

  /**
   * Input opening state
   */
  private inputOpened: boolean = false;

  /**
   * Available Toolbar methods (open/close)
   */
  private toolbar: Toolbar;

  /**
   * Available inline toolbar methods (open/close)
   */
  private inlineToolbar: Toolbar;

  /**
   * Notifier API methods
   */
  private notifier: Notifier;

  /**
   * @param {{api: API}} - Editor.js API
   */
  constructor({api, config}) {
    console.log(api, config);
    this.toolbar = api.toolbar;
    this.inlineToolbar = api.inlineToolbar;
    this.notifier = api.notifier;
    this.selection = new SelectionUtils();
  }

  /**
   * Create button for Inline Toolbar
   */
  public render(): HTMLElement {
    this.nodes.button = document.createElement('button') as HTMLButtonElement;
    this.nodes.button.type = 'button';
    this.nodes.button.classList.add(this.CSS.button, this.CSS.buttonModifier);
    this.nodes.button.appendChild($.svg('link', 15, 14));
    this.nodes.button.appendChild($.svg('unlink', 16, 18));
    return this.nodes.button;
  }

  /**
   * Input for the link
   */
  public renderActions(): HTMLElement {
    // console.log(JSON.parse(window.localStorage.existingLinks));
    this.pageLinks = window.localStorage.existingLinks ? JSON.parse(window.localStorage.existingLinks) : [];
    this.nodes.div = document.createElement('div') as HTMLDivElement;

    this.nodes.header = document.createElement('h6') as HTMLHeadElement;
    this.nodes.header.appendChild(document.createTextNode('Link to Existing Page'));

    this.nodes.ul = document.createElement('ul') as HTMLUListElement;
    this.nodes.ul.setAttribute('class', 'existing-list');

    this.nodes.searchInput = document.createElement('input') as HTMLInputElement;
    this.nodes.searchInput.placeholder = 'Search Pages..';
    this.nodes.searchInput.setAttribute('class', 'search-input');
    this.nodes.searchInput.addEventListener('keyup', (event: KeyboardEvent) => {
      console.log(this.nodes.searchInput.value);
      if (this.nodes.searchInput.value.trim().length) {
        const filtertedList = this.pageLinks.filter((each) => {
          return each.name.toLocaleLowerCase().includes(this.nodes.searchInput.value.trim());
        });
        this.renderList(filtertedList);
      } else {
        this.renderList(this.pageLinks);
      }

    });

    this.renderList(this.pageLinks);

    this.nodes.input = document.createElement('input') as HTMLInputElement;
    this.nodes.input.placeholder = 'Add External URL..';

    this.nodes.div.classList.add(this.CSS.div);
    this.nodes.header.classList.add(this.CSS.header);
    this.nodes.input.classList.add(this.CSS.input);

    this.nodes.input.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.keyCode === this.ENTER_KEY) {
        this.enterPressed(event, false, '');
      }
    });

    this.nodes.div.appendChild(this.nodes.header);
    this.nodes.div.appendChild(this.nodes.searchInput);
    this.nodes.div.appendChild(this.nodes.ul);
    this.nodes.div.appendChild(this.nodes.input);

    console.log('node: ', this.nodes);
    return this.nodes.div;
  }

  /**
   * Handle clicks on the Inline Toolbar icon
   * @param {Range} range
   */
  public surround(range: Range): void {
    /**
     * Range will be null when user makes second click on the 'link icon' to close opened input
     */
    if (range) {
      /**
       * Save selection before change focus to the input
       */
      if (!this.inputOpened) {
        /** Create blue background instead of selection */
        this.selection.setFakeBackground();
        this.selection.save();
      } else {
        this.selection.restore();
        this.selection.removeFakeBackground();
      }
      const parentAnchor = this.selection.findParentTag('A');

      /**
       * Unlink icon pressed
       */
      if (parentAnchor) {
        this.selection.expandToTag(parentAnchor);
        this.unlink();
        this.closeActions();
        this.checkState();
        this.toolbar.close();
        return;
      }
    }

    this.toggleActions();
  }

  /**
   * Check selection and set activated state to button if there are <a> tag
   * @param {Selection} selection
   */
  public checkState(selection?: Selection): boolean {
    console.log('check state here');
    this.nodes.searchInput.value = '';
    this.renderList(this.pageLinks);
    const anchorTag = this.selection.findParentTag('A');

    if (anchorTag) {
      this.nodes.button.classList.add(this.CSS.buttonUnlink);
      this.nodes.button.classList.add(this.CSS.buttonActive);
      this.openActions();

      /**
       * Fill input value with link href
       */
      const hrefAttr = anchorTag.getAttribute('href');
      this.nodes.input.value = hrefAttr !== 'null' ? hrefAttr : '';
      if (hrefAttr !== 'null') {
        this.pageLinks.forEach((page, index) => {
          if (page.url === hrefAttr) {
            this.linkElements[index].classList.add('selected-item');
          } else {
            this.linkElements[index].classList.remove('selected-item');
          }
        });
      } else {
        this.linkElements.forEach((item) => {
          item.classList.remove('selected-item');
        });
      }

      this.selection.save();
    } else {
      this.nodes.button.classList.remove(this.CSS.buttonUnlink);
      this.nodes.button.classList.remove(this.CSS.buttonActive);

      this.linkElements.forEach((item) => {
        item.classList.remove('selected-item');
      });
    }

    return !!anchorTag;
  }

  /**
   * Function called with Inline Toolbar closing
   */
  public clear(): void {
    this.closeActions();
  }

  public renderList(list) {
    while (this.nodes.ul.firstChild) {
      this.nodes.ul.removeChild(this.nodes.ul.firstChild);
    }
    this.linkElements = [];
    list.forEach((each) => {
      const li = document.createElement('li');
      li.setAttribute('class', 'existing-list-item');
      li.innerHTML = li.innerHTML + each.name;
      li.addEventListener('click', (event) => {
        console.log(each);
        this.enterPressed(event, true, each.url);
      });
      this.nodes.ul.appendChild(li);
      this.linkElements.push(li);
    });
  }

  private toggleActions(): void {
    if (!this.inputOpened) {
      this.openActions(true);
    } else {
      this.closeActions(false);
    }
  }

  /**
   * @param {boolean} needFocus - on link creation we need to focus input. On editing - nope.
   */
  private openActions(needFocus: boolean = false): void {
    this.nodes.div.classList.add(this.CSS.divShowed);
    this.nodes.input.classList.add(this.CSS.inputShowed);
    if (needFocus) {
      this.nodes.input.focus();
    }
    this.inputOpened = true;
  }

  /**
   * Close input
   * @param {boolean} clearSavedSelection — we don't need to clear saved selection
   *                                        on toggle-clicks on the icon of opened Toolbar
   */
  private closeActions(clearSavedSelection: boolean = true): void {
    if (this.selection.isFakeBackgroundEnabled) {
      // if actions is broken by other selection We need to save new selection
      const currentSelection = new SelectionUtils();
      currentSelection.save();

      this.selection.restore();
      this.selection.removeFakeBackground();

      // and recover new selection after removing fake background
      currentSelection.restore();
    }

    this.nodes.input.classList.remove(this.CSS.inputShowed);
    this.nodes.div.classList.remove(this.CSS.divShowed);
    this.nodes.input.value = '';
    if (clearSavedSelection) {
      this.selection.clearSaved();
    }
    this.inputOpened = false;
  }

  /**
   * Enter pressed on input
   * @param {KeyboardEvent} event
   */
  private enterPressed(event, isExisting, data): void {
    let value = '';
    if (isExisting) {
      value = data;
    } else {
      value = this.nodes.input.value || '';
    }

    if (!value.trim()) {
      this.selection.restore();
      this.unlink();
      event.preventDefault();
      this.closeActions();
    }

    if (!this.validateURL(value)) {

      this.notifier.show({
        message: 'Pasted link is not valid.',
        style: 'error',
      });

      _.log('Incorrect Link pasted', 'warn', value);
      return;
    }

    value = this.prepareLink(value);

    this.selection.restore();
    this.selection.removeFakeBackground();

    this.insertLink(value);

    /**
     * Preventing events that will be able to happen
     */
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.selection.collapseToEnd();
    this.inlineToolbar.close();
  }

  /**
   * Detects if passed string is URL
   * @param  {string}  str
   * @return {Boolean}
   */
  private validateURL(str: string): boolean {
    /**
     * Don't allow spaces
     */
    return !/\s/.test(str);
  }

  /**
   * Process link before injection
   * - sanitize
   * - add protocol for links like 'google.com'
   * @param {string} link - raw user input
   */
  private prepareLink(link: string): string {
    link = link.trim();
    link = this.addProtocol(link);
    return link;
  }

  /**
   * Add 'http' protocol to the links like 'vc.ru', 'google.com'
   * @param {String} link
   */
  private addProtocol(link: string): string {
    /**
     * If protocol already exists, do nothing
     */
    if (/^(\w+):\/\//.test(link)) {
      return link;
    }

    /**
     * We need to add missed HTTP protocol to the link, but skip 2 cases:
     *     1) Internal links like "/general"
     *     2) Anchors looks like "#results"
     *     3) Protocol-relative URLs like "//google.com"
     */
    const isInternal = /^\/[^\/\s]/.test(link),
      isAnchor = link.substring(0, 1) === '#',
      isProtocolRelative = /^\/\/[^\/\s]/.test(link);

    if (!isInternal && !isAnchor && !isProtocolRelative) {
      link = 'http://' + link;
    }

    return link;
  }

  /**
   * Inserts <a> tag with "href"
   * @param {string} link - "href" value
   */
  private insertLink(link: string): void {

    /**
     * Edit all link, not selected part
     */
    const anchorTag = this.selection.findParentTag('A');

    if (anchorTag) {
      this.selection.expandToTag(anchorTag);
    }

    document.execCommand(this.commandLink, false, link);
  }

  /**
   * Removes <a> tag
   */
  private unlink(): void {
    document.execCommand(this.commandUnlink);
  }
}
