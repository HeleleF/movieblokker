import { Row, Article, Anchor, ScrollItem, TombstoneAnimations } from 'interfaces'
import { rafThrottle } from 'utils'

export abstract class ContentSource {

    abstract fetch(count: number): Promise<any[]>;
    abstract createTombstone(): HTMLDivElement;
    abstract render(item: any, div?: HTMLDivElement): HTMLDivElement;
}

export class MBContentSource extends ContentSource {

    private tombstone_: HTMLDivElement;
    private messageTemplate_: HTMLDivElement;

    private readonly ITEMS_PER_PAGE: number;
    private readonly ITEMS_PER_ROW: number;

    private lastPage: number;
    private rowId: number;

    private parser: DOMParser;

    private category: string;

    private articleSelector: string;
    private query: string | undefined;

    private readonly DOMAIN: string = 'http://movie-blog.sx';

    constructor(cat: string, artSel: string, query?: string) {

        super();

        this.tombstone_ = document.querySelector("#templates > .row-item.tombstone")! as HTMLDivElement;
        this.messageTemplate_ = document.querySelector("#templates > .row-item:not(.tombstone)")! as HTMLDivElement;

        this.ITEMS_PER_PAGE = 10;
        this.ITEMS_PER_ROW = 4;

        this.lastPage = 0;
        this.parser = new DOMParser();

        this.rowId = 0;

        this.category = cat;
        this.articleSelector = artSel;

        if (this.category === 'search') {

            if (!query) {
                throw new TypeError('Search needs a query!');
            } else {
                this.query = query.trim();
            }
        }
    }

    private transformListToData(articleList: HTMLDivElement[]) {

        const len = articleList.length;

        const ret = [];
        let tmp = [];

        for (let i = 0; i < len; i++) {

            const e = articleList[i]!;

            const title = e.querySelector('h1')!.textContent!.trim();
            const link = (e.querySelector('h1 > a')! as HTMLAnchorElement).href!.trim();
            const caption = e.querySelector('.eintrag_x > p')!.textContent!.trim();
            const date = e.querySelector('p.date_x')!.textContent!.trim().slice(0, -3);

            const artImg = (e.querySelector('.eintrag_x p > img') || e.querySelector('.eintrag_x > img')) as HTMLImageElement | null;

            const img = artImg ? artImg.src.trim() : null;

            if (tmp.length === 4) {

                ret.push({ id: this.rowId.toString(), content: tmp } as Row);
                tmp = [];
                this.rowId++;

            } else {
                tmp.push({ title, link, caption, date, img } as Article);
            }
        }

        // a last row with less than 4 articles
        if (tmp.length > 0) {

            const missing = 4 - tmp.length;

            console.log('es fehlen', missing);

            for (let i = 0; i < missing; i++) {
                console.log('hinzufügen');
                tmp.push({ title: 'PLATZHALTER', link: 'https://example.com', caption: 'Ein langer Text', date: '01.01.1990', img: null } as Article);
            }

            ret.push({ id: this.rowId.toString(), content: tmp } as Row);
            this.rowId++;
        }

        return ret;
    }

    private async fetchPage(num: number) {

        let link: string;

        if (this.category === 'search') {
            link = `${this.DOMAIN}/page/${num}/?s=${this.query}&cat=0`;
        } else {
            link = `${this.DOMAIN}/category/${this.category}/page/${num}/`;
        }

        try {

            const response = await fetch(link);
            const t = await response.text();

            const dom = this.parser.parseFromString(t, 'text/html');

            const as = dom.querySelectorAll(this.articleSelector);

            return [...as] as HTMLDivElement[];
        }
        catch (_) {
            return [];
        }
    }

    async fetch(rows: number) {

        console.groupCollapsed('fetch');

        // we need items, not rows
        const itemsNeeded = rows * this.ITEMS_PER_ROW;

        // request as much pages as needed to fulfill the request
        let pagesNeeded = Math.ceil(itemsNeeded / this.ITEMS_PER_PAGE);

        // pages must be even, since we always need 4 items per row
        if (pagesNeeded & 1) {
            pagesNeeded += 1;
        }

        console.debug(`Wir brauchen ${rows} Rows => ${itemsNeeded} Items => ${pagesNeeded} neue Seiten`);

        const proms = [];

        const from = this.lastPage + 1;

        for (let i = from; i < from + pagesNeeded; i++) {
            console.debug(`Holen Seite ${i}`);
            proms.push(this.fetchPage(i));
        }

        const all = await Promise.all(proms);

        this.lastPage += pagesNeeded;

        console.debug(`Last page ist jetzt ${this.lastPage}`);

        console.groupEnd();

        return this.transformListToData(all.flat());
    }

    createTombstone() {
        return this.tombstone_.cloneNode(true) as HTMLDivElement;
    }

    render(item: Row, div?: HTMLDivElement) {
        // TODO: Different style?
        div = div || this.messageTemplate_.cloneNode(true) as HTMLDivElement;
        div.dataset.id = item.id;

        const c = item.content;

        for (let i = 0; i < 4; i++) {

            div.querySelector(`#header-item-${i}`)!.textContent = c[i].title;
            (div.querySelector(`#header-item-${i}`)! as HTMLAnchorElement).href = `${c[i].link}#result`;
            div.querySelector(`#caption-item-${i}`)!.textContent = c[i].caption;
            div.querySelector(`#date-item-${i}`)!.textContent = c[i].date;

            const img = div.querySelector(`#img-item-${i}`)! as HTMLImageElement;

            if (c[i].img) {
                img.classList.remove('invisible');
                img.src = c[i].img!;

            } else {
                img.classList.add('invisible');
            }
        }

        return div;
    }
}

export class InfinityScroller {

    // Number of items to instantiate beyond current view in the scroll direction.
    private readonly RUNWAY_ITEMS = 5;

    // Number of items to instantiate beyond current view in the opposite direction.
    private readonly RUNWAY_ITEMS_OPPOSITE = 5;

    // The number of pixels of additional length to allow scrolling to.
    private readonly SCROLL_RUNWAY = 1000;

    // The animation interval (in ms) for fading in content from tombstones.
    private readonly ANIMATION_DURATION_MS = 200;

    private endReached: boolean;
    private endReachedIdx: number;

    private anchorItem: Anchor;

    private firstAttachedItem_: number;
    private lastAttachedItem_: number;

    private anchorScrollTop: number;

    private tombstoneSize_: number;
    private tombstoneWidth_: number;
    private tombstones_: HTMLDivElement[];

    private scroller_!: HTMLElement;
    private source_: ContentSource;

    private items_: ScrollItem[];
    private loadedItems_: number;

    private requestInProgress_: boolean;

    private scrollRunway_: HTMLDivElement;
    private scrollRunwayEnd_: number;

    private onScrollHandler: EventListener & { cancel(): void };

    private lastScreenItem!: Anchor;

    constructor(source: ContentSource) {

        this.endReached = false;
        this.endReachedIdx = Number.POSITIVE_INFINITY;

        this.anchorItem = { index: 0, offset: 0 };

        this.firstAttachedItem_ = 0;
        this.lastAttachedItem_ = 0;

        this.anchorScrollTop = 0;

        this.scrollRunwayEnd_ = 0;
        this.scrollRunway_ = document.createElement('div');

        const func = this.onScroll_.bind(this);
        this.onScrollHandler = rafThrottle(func);

        this.tombstoneSize_ = 0;
        this.tombstoneWidth_ = 0;
        this.tombstones_ = [];

        this.source_ = source;

        this.items_ = [];
        this.loadedItems_ = 0;

        this.requestInProgress_ = false;
    }

    /**
     * Attaches the actual scroll handler
     */
    start(scroller: HTMLElement) {

        this.scroller_ = scroller;

        this.scroller_.addEventListener('scroll', this.onScrollHandler, { passive: true, capture: false });
        window.addEventListener('resize', this.onResize_.bind(this), { passive: true });

        // Create an element to force the scroller to allow scrolling to a certain point.     
        this.scrollRunway_.textContent = ' ';
        this.scrollRunway_.style.position = 'absolute';
        this.scrollRunway_.style.height = '1px';
        this.scrollRunway_.style.width = '1px';
        this.scrollRunway_.style.transition = 'transform 0.2s';
        this.scroller_.appendChild(this.scrollRunway_);

        this.onResize_();
    }

    /**
     * Resets the Scroller for a new content Source.
     * All values are reset to their intitial value and the scroll event handler
     * is removed.
     */
    reset(newSource?: ContentSource) {

        this.scroller_.removeEventListener('scroll', this.onScrollHandler, { capture: false });
        this.onScrollHandler.cancel();

        this.endReached = false;
        this.endReachedIdx = Number.POSITIVE_INFINITY;

        this.anchorItem = { index: 0, offset: 0 };

        this.firstAttachedItem_ = 0;
        this.lastAttachedItem_ = 0;

        this.anchorScrollTop = 0;

        this.scrollRunwayEnd_ = 0;
        this.scrollRunway_ = document.createElement('div');

        this.tombstoneSize_ = 0;
        this.tombstoneWidth_ = 0;
        this.tombstones_ = [];

        this.items_ = [];
        this.loadedItems_ = 0;

        this.requestInProgress_ = false;

        if (newSource) {
            this.source_ = newSource;
        }
    }

    /**
     * Called when the browser window resizes to adapt to new scroller bounds and
     * layout sizes of items within the scroller.
     */
    onResize_() {

        // TODO: If we already have tombstones attached to the document, it would
        // probably be more efficient to use one of them rather than create a new
        // one to measure.
        const tombstone = this.source_.createTombstone();
        tombstone.style.position = 'absolute';
        this.scroller_.appendChild(tombstone);
        tombstone.classList.remove('invisible');
        this.tombstoneSize_ = tombstone.offsetHeight;
        this.tombstoneWidth_ = tombstone.offsetWidth;
        this.scroller_.removeChild(tombstone);

        // Reset the cached size of items in the scroller as they may no longer be
        // correct after the item content undergoes layout.
        for (let i = 0; i < this.items_.length; i++) {
            this.items_[i].height = this.items_[i].width = 0;
        }
        this.onScroll_();
    }

    /**
     * Called when the scroller scrolls. This determines the newly anchored item
     * and offset and then updates the visible elements, requesting more items
     * from the source if we've scrolled past the end of the currently available
     * content.
     */
    onScroll_() {

        const delta = this.scroller_.scrollTop - this.anchorScrollTop;

        // Special case, if we get to very top, always scroll to top.
        if (!this.scroller_.scrollTop) {
            this.anchorItem = { index: 0, offset: 0 };
        } else {
            this.anchorItem = this.calculateAnchoredItem(this.anchorItem, delta);
        }

        this.anchorScrollTop = this.scroller_.scrollTop;
        this.lastScreenItem = this.calculateAnchoredItem(this.anchorItem, this.scroller_.offsetHeight);

        if (delta < 0) {

            this.fill(this.anchorItem.index - this.RUNWAY_ITEMS, this.lastScreenItem.index + this.RUNWAY_ITEMS_OPPOSITE);

        } else {

            this.fill(this.anchorItem.index - this.RUNWAY_ITEMS_OPPOSITE, this.lastScreenItem.index + this.RUNWAY_ITEMS);
        }
    }

    /**
     * Calculates the item that should be anchored after scrolling by delta from
     * the initial anchored item.
     * @param {Anchor} initialAnchor The initial position
     *     to scroll from before calculating the new anchor position.
     * @param {number} delta The offset from the initial item to scroll by.
     * @return {Anchor} Returns the new item and offset
     *     scroll should be anchored to.
     */
    calculateAnchoredItem(initialAnchor: Anchor, delta: number): Anchor {

        if (!delta) {
            return initialAnchor;
        }

        delta += initialAnchor.offset;
        let i = initialAnchor.index;
        let tombstones = 0;
        if (delta < 0) {
            while (delta < 0 && i > 0 && this.items_[i - 1].height) {
                delta += this.items_[i - 1].height;
                i--;
            }
            tombstones = Math.max(-i, Math.ceil(Math.min(delta, 0) / this.tombstoneSize_));
        } else {
            while (delta > 0 && i < this.items_.length && this.items_[i].height && this.items_[i].height < delta) {
                delta -= this.items_[i].height;
                i++;
            }
            if (i >= this.items_.length || !this.items_[i].height)
                tombstones = Math.floor(Math.max(delta, 0) / this.tombstoneSize_);
        }
        i += tombstones;
        delta -= tombstones * this.tombstoneSize_;
        return {
            index: i,
            offset: delta,
        };
    }

    /**
     * Sets the range of items which should be attached and attaches those items.
     * @param {number} start The first item which should be attached.
     * @param {number} end One past the last item which should be attached.
     */
    fill(start: number, end: number) {

        this.firstAttachedItem_ = Math.max(0, start);
        this.lastAttachedItem_ = Math.min(this.endReachedIdx, end);

        // console.log(`Filling from ${this.firstAttachedItem_} to ${this.lastAttachedItem_}, ende? ${this.endReached}`)
        this.attachContent();
    }

    /**
     * Creates or returns an existing tombstone ready to be reused.
     */
    getTombstone(): HTMLDivElement {
        const tombstone = this.tombstones_.pop();
        if (tombstone) {
            tombstone.classList.remove('invisible');
            tombstone.style.opacity = '1';
            tombstone.style.transform = '';
            tombstone.style.transition = '';
            return tombstone;
        }
        return this.source_.createTombstone();
    }

    /**
     * Attaches content to the scroller and updates the scroll position if
     * necessary.
     */
    attachContent() {
        // Collect nodes which will no longer be rendered for reuse.
        // TODO: Limit this based on the change in visible items rather than looping
        // over all items.

        if (this.firstAttachedItem_ === this.lastAttachedItem_) {
            console.debug('Endless loop detected, bail');
            return;
        }

        const unusedNodes: HTMLDivElement[] = [];
        for (let i = 0; i < this.items_.length; i++) {
            // Skip the items which should be visible.
            if (i == this.firstAttachedItem_) {
                i = this.lastAttachedItem_ - 1;
                continue;
            }
            if (this.items_[i].node) {
                if (this.items_[i].node!.classList.contains('tombstone')) {
                    this.tombstones_.push(this.items_[i].node!);
                    this.tombstones_[this.tombstones_.length - 1].classList.add('invisible');
                } else {
                    unusedNodes.push(this.items_[i].node!);
                }
            }
            this.items_[i].node = null;
        }

        const tombstoneAnimations: TombstoneAnimations = {};

        // Create DOM nodes.
        for (let i = this.firstAttachedItem_; i < this.lastAttachedItem_; i++) {
            while (this.items_.length <= i)
                this.addItem_();
            if (this.items_[i].node) {
                // if it's a tombstone but we have data, replace it.
                if (this.items_[i].node!.classList.contains('tombstone') &&
                    this.items_[i].data) {
                    // TODO: Probably best to move items on top of tombstones and fade them in instead.
                    if (this.ANIMATION_DURATION_MS) {
                        this.items_[i].node!.style.zIndex = '1';
                        tombstoneAnimations[i] = [this.items_[i].node, this.items_[i].top - this.anchorScrollTop];
                    } else {
                        this.items_[i].node!.classList.add('invisible');
                        this.tombstones_.push(this.items_[i].node!);
                    }
                    this.items_[i].node = null;
                } else {
                    continue;
                }
            }
            const node = this.items_[i].data ? this.source_.render(this.items_[i].data!, unusedNodes.pop()) : this.getTombstone();
            // Maybe don't do this if it's already attached?
            node.style.position = 'absolute';
            this.items_[i].top = -1;
            this.scroller_.appendChild(node);
            this.items_[i].node = node;
        }

        // Remove all unused nodes
        while (unusedNodes.length) {
            this.scroller_.removeChild(unusedNodes.pop()!);
        }

        // Get the height of all nodes which haven't been measured yet.
        for (let i = this.firstAttachedItem_; i < this.lastAttachedItem_; i++) {
            // Only cache the height if we have the real contents, not a placeholder.
            if (this.items_[i].data && !this.items_[i].height) {
                this.items_[i].height = this.items_[i].node!.offsetHeight;
                this.items_[i].width = this.items_[i].node!.offsetWidth;
            }
        }

        // Fix scroll position in case we have realized the heights of elements
        // that we didn't used to know.
        // TODO: We should only need to do this when a height of an item becomes
        // known above.
        this.anchorScrollTop = 0;
        for (let i = 0; i < this.anchorItem.index; i++) {
            this.anchorScrollTop += this.items_[i].height || this.tombstoneSize_;
        }
        this.anchorScrollTop += this.anchorItem.offset;

        // Position all nodes.
        let curPos = this.anchorScrollTop - this.anchorItem.offset;
        let j = this.anchorItem.index;

        while (j > this.firstAttachedItem_) {
            curPos -= this.items_[j - 1].height || this.tombstoneSize_;
            j--;
        }

        while (j < this.firstAttachedItem_) {
            curPos += this.items_[j].height || this.tombstoneSize_;
            j++;
        }

        // Set up initial positions for animations.
        for (const idx in tombstoneAnimations) {

            const anim = tombstoneAnimations[idx];

            this.items_[idx].node!.style.transform = `translateY(${this.anchorScrollTop + anim[1]}px) scale(${this.tombstoneWidth_ / this.items_[idx].width}, ${this.tombstoneSize_ / this.items_[idx].height})`;

            // Call offsetTop on the nodes to be animated to force them to apply current transforms.
            this.items_[idx].node!.offsetTop;
            anim[0].offsetTop;

            this.items_[idx].node!.style.transition = `transform ${this.ANIMATION_DURATION_MS}ms`;
        }

        for (let i = this.firstAttachedItem_; i < this.lastAttachedItem_; i++) {
            var anim = tombstoneAnimations[i];
            if (anim) {
                anim[0].style.transition = `transform ${this.ANIMATION_DURATION_MS}ms, opacity ${this.ANIMATION_DURATION_MS}ms`;
                anim[0].style.transform = `translateY(${curPos}px) scale(${this.items_[i].width / this.tombstoneWidth_}, ${this.items_[i].height / this.tombstoneSize_})`;
                anim[0].style.opacity = 0;
            }
            if (curPos != this.items_[i].top) {
                if (!anim)
                    this.items_[i].node!.style.transition = '';
                this.items_[i].node!.style.transform = `translateY(${curPos}px)`;
            }
            this.items_[i].top = curPos;
            curPos += this.items_[i].height || this.tombstoneSize_;
        }

        this.scrollRunwayEnd_ = Math.max(this.scrollRunwayEnd_, curPos + this.SCROLL_RUNWAY)
        this.scrollRunway_.style.transform = `translate(0, ${this.scrollRunwayEnd_}px)`;
        this.scroller_.scrollTop = this.anchorScrollTop;

        if (this.ANIMATION_DURATION_MS) {
            // TODO: Should probably use transition end, but there are a lot of animations we could be listening to.
            setTimeout(() => {
                for (const i in tombstoneAnimations) {
                    const anim = tombstoneAnimations[i];
                    anim[0].classList.add('invisible');
                    this.tombstones_.push(anim[0]);
                    // Tombstone can be recycled now.
                }
            }, this.ANIMATION_DURATION_MS)
        }

        this.maybeRequestContent();

    }

    /**
     * Requests additional content if we don't have enough currently.
     */
    maybeRequestContent() {
        // Don't issue another request if one is already in progress as we don't
        // know where to start the next request yet.
        if (this.requestInProgress_ || this.endReached)
            return;
        const itemsNeeded = this.lastAttachedItem_ - this.loadedItems_;
        if (itemsNeeded <= 0)
            return;
        this.requestInProgress_ = true;
        this.source_.fetch(itemsNeeded).then(this.addContent.bind(this));
    }

    /**
     * Adds an item to the items list.
     */
    addItem_() {
        this.items_.push({
            'data': null,
            'node': null,
            'height': 0,
            'width': 0,
            'top': 0,
        })
    }

    /**
     * Adds the given array of items to the items list and then calls
     * attachContent to update the displayed content.
     */
    addContent(items: Row[]) {

        this.requestInProgress_ = false;

        if (!items.length) {
            this.endReached = true;
            this.endReachedIdx = this.lastScreenItem.index;
            return;
        }

        for (let i = 0; i < items.length; i++) {
            if (this.items_.length <= this.loadedItems_)
                this.addItem_();
            this.items_[this.loadedItems_++].data = items[i];
        }

        this.attachContent();
    }
}