import { ArticleInfo, MBComment, MBGroup, MBLink, MBMeta, MBRelease } from 'interfaces'
import { ContentSource, MBContentSource, InfinityScroller } from 'scroller'

class MBExtractor {

    private debug: boolean;

    private readonly WRAPPER_CLASS_NAME = 'eintrag2';

    private currentGroup: MBGroup;

    public mainImgElem: HTMLImageElement | null;
    public mainWrapper: HTMLDivElement | null;

    public collapseGroups: HTMLDivElement[];

    public metas: any;

    public collector: ArticleInfo;

    constructor(debug = false) {
        this.debug = debug;

        this.mainWrapper = document.querySelector(`.${this.WRAPPER_CLASS_NAME}`);
        this.mainImgElem = document.querySelector(`.${this.WRAPPER_CLASS_NAME} p > img`) || document.querySelector(`.${this.WRAPPER_CLASS_NAME} > img`);

        this.collapseGroups = [...document.querySelectorAll(`.${this.WRAPPER_CLASS_NAME} .sp-wrap`)] as HTMLDivElement[];

        this.collector = {} as ArticleInfo;
        this.collector.downloadGroups = [];

        this.currentGroup = {} as MBGroup;

        this.metas = {};
    }

    private log(msg: any) {

        if (!this.debug) return;

        if (msg === null) {
            msg = String(msg);
        }

        switch (typeof msg) {
            case 'function':
            case 'number':
            case 'bigint':
            case 'boolean':
            case 'symbol':
            case 'undefined':
                msg = String(msg);
                break;

            case 'object':

                if (msg instanceof HTMLElement) {

                    msg = `<${msg.tagName}> Content: ${msg.textContent}`;

                } else {
                    msg = JSON.stringify(msg, null, 1);
                }
                break;
        }

        console.debug(`${new Date().toLocaleTimeString('de-DE')} - EXTRACTOR - ${msg.trim()}`);
    }

    private getReleaseName() {

        const releaseName = document.querySelector('h1 span.fn')?.textContent?.trim();

        if (releaseName) {
            this.collector.releaseName = releaseName;
        }
    }

    private getImgSrc() {

        if (this.mainImgElem) {
            this.collector.imageSrc = this.mainImgElem.src;
        }
    }

    private getCategories() {
        const categories = [...document.querySelectorAll('#info a[rel="category tag"]')].map(t => {
            let cat = t.textContent!.trim();

            if (cat.startsWith('-')) {
                return cat.slice(1).trim();
            }
            return cat;
        });

        this.collector.categories = categories;
    }

    private extractCommentBody = (startElem: HTMLElement) => {

        let t = startElem.nextElementSibling;

        let r = '';

        while (t?.tagName === 'P') {
            r += `${t.textContent!}\n\n`;
            t = t.nextElementSibling;
        }
        return r.trim();
    }

    private getComments() {

        const comments = [...document.querySelectorAll('ol.commentlist > li')].map(c => {

            const info = c.querySelector('.com_info')!.textContent!.trim();
            const [author, date] = info.split('\n');

            const content = c.querySelector('.commentcount')!.nextElementSibling as HTMLElement;

            return {
                author: author.trim(),
                from: date.trim(),
                message: this.extractCommentBody(content)
            } as MBComment
        });

        this.collector.comments = comments;
    }

    private getDate() {
        const date = document.querySelector('#info > p.info_s')?.childNodes[0]?.textContent?.trim();

        if (date?.startsWith('Datum:')) {
            this.collector.date = date.slice(6).trim();
        }
    }

    private cleanMeta(str: string | undefined, meta: MBMeta) {

        if (str?.endsWith('|')) {
            str = str.slice(0, -1).trim();
        }

        if (str) {
            this.metas[MBMeta[meta]] = str;
        }
    }

    private getMeta() {

        if (!this.mainImgElem) return;

        let tmp = this.mainImgElem.nextElementSibling;

        while (tmp) {

            if (tmp.tagName === 'STRONG') {

                const txt = tmp.textContent?.trim();
                const val = tmp.nextSibling?.textContent?.trim();

                switch (txt) {
                    case 'Dauer:':

                        this.cleanMeta(val, MBMeta.LENGTH);
                        break;

                    case 'Format:':
                        this.cleanMeta(val, MBMeta.FORMAT);
                        break;

                    case 'Größe:':
                        this.cleanMeta(val, MBMeta.SIZE);
                        break;
                }
            }

            tmp = tmp.nextElementSibling;
        }

        for (const key in this.metas) {
            this.collector[key.toLowerCase() as 'length' | 'size' | 'format'] = this.metas[key];
        }
    }

    private decrypt(encrypted: string | null) {

        if (!encrypted) return '';

        return encrypted
            .match(/.{2}/g)! // split string every 2 characters
            .map(n => parseInt(n, 16)) // parse each pair as hex number
            .reduce((acc, cur, idx, arr) => { // XOR
                if (idx > 0) {
                    acc += String.fromCharCode(cur ^ arr[0]);
                }
                return acc;
            }, '');
    }

    private fixCF(elem: Element) {

        const decrypted = this.decrypt(elem.getAttribute('data-cfemail'));

        const replacement = document.createTextNode(decrypted);
        elem.replaceWith(replacement);
    }

    private getNotesFromBlock() {

        if (!this.mainWrapper) return;

        const block = this.mainWrapper.querySelector('blockquote');

        if (!block) return;

        block.querySelectorAll('.__cf_email__').forEach(this.fixCF.bind(this));

        this.collector.additionalReleaseInformation = block.innerHTML;
    }

    private extractNotes(div: HTMLDivElement) {

        const groupName = div.querySelector('.sp-head')?.textContent?.trim();

        this.log(`Notes group: ${groupName}`);

        div.querySelectorAll('div.spdiv').forEach(e => e.remove());

        const content = div.querySelector('.sp-body')?.innerHTML;
        if (content) {
            this.collector.additionalNotes = content;
        }
    }

    private getNotesFromCollapsible() {

        if (!this.mainImgElem) return;

        this.collapseGroups
            .filter(group => group.compareDocumentPosition(this.mainImgElem!) & Node.DOCUMENT_POSITION_FOLLOWING)
            .forEach(this.extractNotes.bind(this));
    }

    private getNotesFromParagraphInGroup(paragraph: HTMLParagraphElement) {
        this.log(paragraph);
    }

    private getSample() {

        if (this.mainImgElem) {
            let lastElem = this.mainImgElem.parentElement?.lastElementChild;

            if (lastElem?.tagName === 'BR') {
                lastElem = lastElem.previousElementSibling;
            }

            const href = (lastElem as HTMLAnchorElement | null)?.href;

            if (href && !href.includes('imdb.com') && !href.includes('none')) {
                this.collector.sampleLink = href.trim();
            }
        }

        /*
        const sampleLink = (document.querySelector(`.${this.WRAPPER_CLASS_NAME} p > a[target="_blank"]:last-child`) as HTMLAnchorElement | null)?.href;

        if (sampleLink && !sampleLink.includes('imdb.com')) {
            this.collector.sampleLink = sampleLink.trim();
        }
        */
    }

    private buildDescription(desc: string, cur: Element) {

        switch (cur.tagName) {
            case 'P':
                desc += cur.textContent!.trim() + '\n\n';
        }
        return desc;
    }

    private getDescription() {

        if (!this.mainWrapper || !this.mainImgElem) return;

        const possibleTags = [...this.mainWrapper.children]
            .filter(e => {
                const mask = e.compareDocumentPosition(this.mainImgElem!);

                return (mask & Node.DOCUMENT_POSITION_FOLLOWING) && !(mask & Node.DOCUMENT_POSITION_CONTAINED_BY);
            });

        const description = possibleTags.reduce(this.buildDescription, '');

        if (description) {
            this.collector.description = description;
        }
    }

    private convertSingle(aElem: HTMLAnchorElement) {
        return {
            hoster: aElem.textContent!.replace(/[^a-zA-Z0-9\.]/g, ''),
            link: aElem.href
        } as MBLink
    }

    private convertLinksFromList(nodeList: ChildNode[]) {

        const ret: MBLink[] = [];

        nodeList.forEach(node => {

            switch (node.nodeName) {

                case 'A':
                    ret.push(this.convertSingle(node as HTMLAnchorElement));
                    break;

                case 'SPAN':
                    ret.push(...this.convertLinksToObjects(node as HTMLElement));
                    break;

                default: break;
            }

        });

        return ret;
    }

    private convertLinksToObjects(wrapper?: HTMLElement) {

        if (!wrapper) return [];

        return ([...wrapper.querySelectorAll('a[href*="filecrypt"]')] as HTMLAnchorElement[]).map(this.convertSingle);
    }

    private handleMultipleInOneParagraph(nodeList: ChildNode[], names: string[]) {

        const expectedReleases = names.filter(name => name === 'SPAN').length / 2;

        if (!Number.isInteger(expectedReleases)) {
            console.log(`Number of spans is not divisible by 2! ${expectedReleases}`);
            return;
        }

        console.log(`Expecting ${expectedReleases} releases in this paragraph`);

        for (let j = 0; j < expectedReleases; j++) {

            console.groupCollapsed(`Release #${j}`);

            let curStart = 0;
            let spanIdx = nodeList.findIndex(n => n.nodeName === 'SPAN' && (n as Element).id.startsWith('mirror_') && !(n as Element).id.endsWith('_x'));

            if (spanIdx === -1) {
                throw new RangeError(`No span found?`);
            }

            let obj = {} as MBRelease;

            for (let i = curStart; i <= spanIdx; i++) {

                const node = nodeList[i];

                switch (node.nodeName) {

                    case '#text':
                        const content = node.textContent?.trim();

                        if (content && /[a-z]/i.test(content)) {
                            console.log(`Found release name ${content}`);
                            obj.releaseName = content;
                        }
                        break;

                    case 'SPAN':
                        const links = this.convertLinksToObjects(node as HTMLElement);

                        if (links.length) {
                            console.log(`Found links`, links);
                            if (obj.mirrors) {
                                obj.mirrors.push(...links);
                            } else {
                                obj.mirrors = links;
                            }
                        }
                        break;

                    case 'A':
                        const link = this.convertSingle(node as HTMLAnchorElement);
                        console.log(`Found single`, link);

                        if (obj.mirrors) {
                            obj.mirrors.push(link);
                        } else {
                            obj.mirrors = [link];
                        }
                        break;

                    default: break;
                }
            }

            const maybePW = nodeList[++spanIdx];

            if (maybePW.nodeName === 'STRONG' && maybePW.textContent?.trim() === 'Passwort:') {
                const pw = nodeList[++spanIdx].textContent?.trim();

                if (pw) {
                    console.log(`Found password: "${pw}"`)
                    obj.password = pw;
                }
            }

            nodeList = nodeList.slice(++spanIdx);

            this.currentGroup.releases.push(obj);
            console.groupEnd();

        }
    }

    private handleParagraphInGroup(paragraph: HTMLParagraphElement, pIdx: number) {

        console.groupCollapsed(`Handling paragraph #${pIdx}...`);

        const nodes = [...paragraph.childNodes];
        if (!nodes.length) return;

        const nodeNames = nodes.map(n => n.nodeName);

        if (!nodeNames.includes('A')) {
            console.log(`Paragraph without link tags, maybe notes?`);
            this.getNotesFromParagraphInGroup(paragraph);
            console.groupEnd();
            return;
        }

        const titles = nodeNames.filter(name => name === 'SPAN');

        // erstes strong element ist immer "Download:"
        // das zweite ist "Passwort:", wenn vorhanden
        if (titles.length > 2) {
            console.log(`Paragraph maybe contains more than 1 release...`);
            this.handleMultipleInOneParagraph(nodes, nodeNames);
            console.groupEnd();
            return;
        }

        const first = nodes[0];
        const obj = {} as MBRelease;

        if (first.nodeName === '#text') {
            const name = first.textContent?.trim();
            console.log(`Found release name "${name}"`);
            obj.releaseName = name;
        }

        const links = this.convertLinksToObjects(paragraph);

        if (links.length) {
            console.log(`Found links`, links);
            obj.mirrors = links;
        }

        const last = nodes.pop();
        const elm = nodes.pop();

        if (elm?.nodeName === 'STRONG' && elm.textContent?.trim() === 'Passwort:' && last?.nodeName === '#text') {
            const password = last.textContent?.trim();

            if (password) {
                console.log(`Found password "${password}"`);
                obj.password = password;
            }
        }

        this.currentGroup.releases.push(obj);

        console.groupEnd();

    }

    private handleLinkGroup(group: HTMLDivElement) {

        const linkGroupName = group.querySelector('.sp-head')?.textContent?.trim();
        const paragraphs = [...group.querySelectorAll('.sp-body > p')] as HTMLParagraphElement[];

        if (!paragraphs.length) {
            this.log(`Group "${linkGroupName}" without paragraphs in body!`);
            return;
        }
        console.groupCollapsed(`Handling link group "${linkGroupName}"...`);

        this.currentGroup = {
            groupName: linkGroupName,
            releases: []
        };

        paragraphs.forEach(this.handleParagraphInGroup.bind(this));
        console.groupEnd();

        this.collector.downloadGroups.push(this.currentGroup);

    }

    private handleSingleParagraph(paragraph: HTMLParagraphElement, isParentOfMainImg: boolean = false) {

        let nodes = [...paragraph.childNodes];
        if (!nodes.length) return;

        if (isParentOfMainImg) {

            const startIdx = nodes.findIndex(n => n.nodeName === 'STRONG' && n.textContent?.trim() === 'Download:');

            if (startIdx === -1) {

                const hasSpans = nodes.filter(n => n.nodeName === 'SPAN').length;

                if (hasSpans) {
                    throw new RangeError(`No strong element found with text "Download:"?`);
                }
                console.log(`Image wrapper contains no links`);
                return;
            }

            nodes = nodes.slice(startIdx);
        }

        const nodeNames = nodes.map(n => n.nodeName);

        if (!nodeNames.includes('A')) {
            console.log(`Single Paragraph without link tags, maybe notes?`);

            if (nodes.length === 1) {
                const notesBetweenLinks = nodes[0].textContent?.trim();

                if (notesBetweenLinks) {
                    this.collector.additionalNotesBetweenLinks = notesBetweenLinks;
                }
            }

            return;
        }

        const titles = nodeNames.filter(name => name === 'SPAN');

        if (titles.length > 2) {
            console.log(`Single Paragraph maybe contains more than 1 release...`);
            return;
        }

        const first = nodes[0];
        const obj = {} as MBRelease;

        if (first.nodeName === 'STRONG') {
            const name = first.textContent?.trim();
            console.log(`Found release name "${name}"`);
            obj.releaseName = name;
        }

        const links = isParentOfMainImg ? this.convertLinksFromList(nodes) : this.convertLinksToObjects(paragraph);

        if (links.length) {
            console.log(`Found links`, links);
            obj.mirrors = links;
        }

        const last = nodes.pop();
        const elm = nodes.pop();

        if (elm?.nodeName === 'STRONG' && elm.textContent?.trim() === 'Passwort:' && last?.nodeName === '#text') {
            const password = last.textContent?.trim();

            if (password) {
                console.log(`Found password "${password}"`);
                obj.password = password;
            }
        }

        this.collector.downloadGroups.push({
            releases: [obj]
        });
    }

    private handleLinksWithoutGroups() {
        const possible = [...document.querySelectorAll(`.${this.WRAPPER_CLASS_NAME} > p`)] as HTMLParagraphElement[];

        for (let i = possible.length - 1; i >= 0; i--) {

            console.groupCollapsed(`Handling paragraph #${i}`);

            const para = possible[i];
            const mask = para.compareDocumentPosition(this.mainImgElem!);

            if (mask & Node.DOCUMENT_POSITION_PRECEDING) {

                this.handleSingleParagraph(para);

            } else if (mask & Node.DOCUMENT_POSITION_CONTAINED_BY) {

                this.handleSingleParagraph(para, true);
            } else {
                console.log(`Paragraph is neither image parent nor after image`);
                console.groupEnd();
                break;
            }
            console.groupEnd();
        }
    }

    private getDownloads() {

        if (!this.mainImgElem) return;

        const linkGroups = this.collapseGroups
            .filter(group => group.compareDocumentPosition(this.mainImgElem!) & Node.DOCUMENT_POSITION_PRECEDING);

        if (linkGroups.length) {

            linkGroups.forEach(this.handleLinkGroup.bind(this));

        } else {
            console.log(`No groups...`);
            this.handleLinksWithoutGroups();
        }
    }

    extract() {

        this.log('Starting...');

        this.getReleaseName();
        this.getImgSrc();
        this.getCategories();
        this.getComments();
        this.getDate();
        this.getMeta();
        this.getNotesFromBlock();
        this.getNotesFromCollapsible();
        this.getSample();
        this.getDescription();
        this.getDownloads();

        return this.collector;
    }
}

/**
 * Fixes the site
 */
export class MBFixer {

    private content!: ContentSource;
    private infScroller!: InfinityScroller;

    private useDebug: boolean;
    private siteType: string;

    private info: ArticleInfo | null;

    public extractor: MBExtractor;

    private scrollElem!: HTMLElement;
    private resultElem!: HTMLElement;
    private resultWrapper!: HTMLElement;
    private debugElem!: HTMLPreElement;

    private toggleFunc: EventListener;

    constructor(where: string, debug: boolean = false) {

        this.useDebug = debug;
        this.siteType = where.trim();
        this.info = null;

        this.toggleFunc = this.toggle.bind(this);

        this.extractor = new MBExtractor(true);

        this.rebuild();
    }

    private log(message?: string) {
        if (this.useDebug && message) console.debug(`${new Date().toLocaleTimeString('de-DE')} - DEBUG - ${message.trim()}`);
    }


    /**
     * Returns a string containing HTML for the head tag.
     */
    private setupHead() {
        return `
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width">
        <title>MovieBloKK ${this.siteType}</title>
        <link rel='stylesheet' href='https://fonts.googleapis.com/css?family=Roboto' type='text/css'>
        <link rel="stylesheet" href="https://use.fontawesome.com/releases/v5.13.0/css/all.css" integrity="sha384-Bfad6CLCknfcloXFOyFnlgtENryhrpZCe29RTifKEixXQZ38WheV+i/6YWSzkz3V" crossorigin="anonymous">`;
    }

    /**
     * Returns a string containing HTML for the body tag.
     */
    private setupPage() {

        const scrollerStuff = `
        <div id="templates">
        <li class="row-item" data-id="{{id}}">
            <article class="flex-item">
                <h1><a id="header-item-0" class="post-header"></a></h1>
                <p id="date-item-0" class="post-date"></p>
                <p id="caption-item-0" class="post-caption min-height"></p>
                <img id="img-item-0" class="post-img">
            </article>
            <article class="flex-item">
                <h1><a id="header-item-1" class="post-header"></a></h1>
                <p id="date-item-1" class="post-date"></p>
                <p id="caption-item-1" class="post-caption min-height"></p>
                <img id="img-item-1" class="post-img">
            </article>
            <article class="flex-item">
                <h1><a id="header-item-2" class="post-header"></a></h1>
                <p id="date-item-2" class="post-date"></p>
                <p id="caption-item-2" class="post-caption min-height"></p>
                <img id="img-item-2" class="post-img">
            </article>
            <article class="flex-item">
                <h1><a id="header-item-3" class="post-header"></a></h1>
                <p id="date-item-3" class="post-date"></p>
                <p id="caption-item-3" class="post-caption min-height"></p>
                <img id="img-item-3" class="post-img">
            </article>
        </li>
        <li class="row-item tombstone" data-id="{{id}}">
            <article class="flex-item">
                <h1 class="post-header shimmer"></h1>
                <p class="post-caption"></p>
                <p class="post-caption"></p>
                <p class="post-caption"></p>
                <img class="post-img" src="https://www.placecage.com/340/430">
            </article>
            <article class="flex-item">
                <h1 class="post-header shimmer"></h1>
                <p class="post-caption"></p>
                <p class="post-caption"></p>
                <p class="post-caption"></p>
                <img class="post-img" src="https://www.placecage.com/340/430">
            </article>
            <article class="flex-item">
                <h1 class="post-header shimmer"></h1>
                <p class="post-caption"></p>
                <p class="post-caption"></p>
                <p class="post-caption"></p>
                <img class="post-img" src="https://www.placecage.com/340/430">
            </article>
            <article class="flex-item">
                <h1 class="post-header shimmer"></h1>
                <p class="post-caption"></p>
                <p class="post-caption"></p>
                <p class="post-caption"></p>
                <img class="post-img" src="https://www.placecage.com/340/430">
            </article>
        </li>
    </div>`;

        const navMenuStuff = `
        <ul class="nav-menu">
            <li class="nav-item"><a href="#home" data-type="#home">Home</a></li>
            <li class="nav-item nav-item-dropdown">
                <a href="javascript:void(0)" class="nav-item-dropbtn">Kategorie</a>
                <div class="nav-item-dropdown-content">
                    <a id="moviesNav" href="#movies" data-type="#movies">Filme</a>
                    <a id="seriesNav" href="#series" data-type="#series">Serien</a>
                    <a id="docusNav" href="#docus" data-type="#docus">Dokus</a>
                    <a id="sportsNav" href="#sports" data-type="#sports">Sport</a>
                </div>
            </li>
            <li class="nav-item nav-item-right">
                <div class="search-container">
                    <a id="searchNav" href="#search" data-type="#search"><i class="fa fa-search" data-type="#search"></i></a>
                    <input id="search-bar" type="text" placeholder="Search (doesnt work yet!)..." name="search" autocomplete="off">
                </div>
            </li>
        </ul>`;

        const resultStuff = `
        <div class="result-article-wrapper">
            <article class="article-result invisible">
                <h1 id="header-result" class="result-header"></h1>
                <p id="caption-result" class="result-caption"></p>
                <blockquote id="block-result" class="result-block"></blockquote>
                <img id="img-result" class="result-img">
            </article>
            <a id="toggle" title="Toggle debug view"><i class="fas fa-cogs fa-2x"></i></a>
            <pre id="debug-overlay" class="json invisible"></pre>
        </div>
        `;

        return `${navMenuStuff}${scrollerStuff}${resultStuff}`;
    }

    private rebuildPage() {
        // Rebuild entire site from scratch
        document.head.innerHTML = this.setupHead();

        if (this.siteType === 'result') {
            this.info = this.extractor.extract();
        }

        document.body = document.createElement('body');
        document.body.innerHTML = this.setupPage();

        if (this.siteType !== 'result') {
            document.getElementById(`${this.siteType}Nav`)?.classList.add('nav-item-active');
        }
    }

    private toggle() {
        this.resultElem.classList.toggle('invisible');
        this.debugElem.classList.toggle('invisible');
    }

    private addComments() {
        const list = document.createElement('ol');
        list.className = 'commentlist';

        this.info!.comments.forEach((comment, idx) => {

            const cbody = document.createElement('li');
            cbody.className = 'comment';

            cbody.innerHTML = `
            <div class="commenticon"><i class="far fa-comment"></i></div>
            <div class="commentinfo">${comment.author}
                <br>
                <p class="commentlink">${comment.from}</p>
            </div>
            <div class="commentcount">${idx + 1}</div>
            <br>
            <p>${comment.message}</p>
            `;

            list.appendChild(cbody);

        });

        this.resultElem.appendChild(list);
    }

    private mirrorToHTML(link: MBLink) {
        return `
        <a class="hoster" target="_blank" rel="noreferrer" href="${link.link}">${link.hoster}</a>
        `;
    }

    private releaseToHTML(release: MBRelease) {
        return `
        <p class="release-name">${release.releaseName}<br>
        ${release.mirrors.map(this.mirrorToHTML).join('<br>')}
        </p>
        `;
    }

    private addGroups() {

        this.info!.downloadGroups.forEach(group => {

            const wrap = document.createElement('div');
            wrap.className = 'group-wrapper';

            wrap.innerHTML = `
            <div class="group-header group-header-btn"><i class="fa fa-plus-square group-header-btn"></i><span class="group-title group-header-btn">${group.groupName ?? 'Download'}</span></div>
            <div class="group-body group-body-folded">
                ${group.releases.map(this.releaseToHTML.bind(this)).join('')}
            </div>
            `;

            this.resultElem.appendChild(wrap);
        });

        this.resultElem.addEventListener('click', (ev) => {

            const t = ev.target as HTMLElement;
            if (!t.classList.contains('group-header-btn')) return;

            const header = t.closest('.group-header')!;
            header.firstElementChild!.classList.toggle('fa-minus-square');
            header.firstElementChild!.classList.toggle('fa-plus-square');

            header.nextElementSibling!.classList.toggle('group-body-folded');

        });

    }

    private buildResultPage() {

        if (this.infScroller) {
            this.infScroller.reset();
        }

        if (!this.info) {
            this.log(`No article information to rebuild the page!`)
            return;
        }

        document.body.classList.remove('overflower');

        this.resultWrapper.classList.remove('invisible');
        this.resultElem.classList.remove('invisible');

        this.debugElem.textContent = JSON.stringify(this.info, null, 2);
        document.getElementById('toggle')!.addEventListener('click', this.toggleFunc);

        this.resultElem.querySelector('#header-result')!.textContent = this.info.releaseName;
        this.resultElem.querySelector('#caption-result')!.textContent = this.info.description;
        this.resultElem.querySelector('#block-result')!.innerHTML = this.info.additionalReleaseInformation ?? '';
        (this.resultElem.querySelector('#img-result')! as HTMLImageElement).src = this.info.imageSrc;

        this.addGroups();

        if (this.info.comments.length) {
            this.addComments();
        }

    }

    private getSearch() {
        const inp = document.getElementById('search-bar') as HTMLInputElement;

        return inp.value.replace(/ /g, '+');
    }

    private setupScrollingPage(category: string, selector: string) {

        document.body.classList.add('overflower');

        this.resultWrapper.classList.add('invisible');
        this.resultElem.classList.add('invisible');

        document.getElementById('toggle')!.removeEventListener('click', this.toggleFunc);

        if (this.scrollElem) {

            this.log(`Resusing scroll wrapper`);
            this.scrollElem.innerHTML = '';

        } else {

            this.log(`Creating new scroll wrapper`);

            this.scrollElem = document.createElement('ul');
            this.scrollElem.id = 'scroller';
            document.body.appendChild(this.scrollElem);

        }

        // create new content source
        this.content = new MBContentSource(category, selector, category === 'search' ? this.getSearch() : undefined);

        if (this.infScroller) {

            this.log(`Resetting scroller with new source`);
            this.infScroller.reset(this.content);
        } else {

            this.log(`Creating new scroller`);
            this.infScroller = new InfinityScroller(this.content);
        }

        this.log(`Starting scroller`);
        this.infScroller.start(this.scrollElem);
    }

    private decideWhatToDo() {

        let category, selector;

        switch (this.siteType) {

            case 'home':
                this.log(`Leaving extension`);
                location.href = location.origin;
                return;

            case 'movies':
                [category, selector] = ['hd', 'div.beitrag2'];
                break;

            case 'series':
                [category, selector] = ['hd-serien', 'div.beitrag2'];
                break;

            case 'docus':
                [category, selector] = ['hd-doku', 'div.beitrag2'];
                break;

            case 'sports':
                [category, selector] = ['hd-sport', 'div.beitrag2'];
                break;

            case 'search':
                [category, selector] = ['search', 'div.post'];
                break;

            case 'result':
                return this.buildResultPage();

            default:
                this.log(`Invalid site type: ${this.siteType}, leaving...`);
                location.href = location.origin;
                return;
        }

        return this.setupScrollingPage(category, selector);

    }

    private navigate(ev: Event) {

        const el = ev.target as HTMLElement;

        if (el.tagName !== 'A' && !el.dataset.type) return;

        if (el.classList.contains('nav-item-active')) return;

        if (el.tagName === 'A') {
            document.querySelectorAll('.nav-item-dropdown-content a').forEach(a => a.classList.remove('nav-item-active'));
            el.classList.add('nav-item-active');
        }

        this.siteType = el.dataset.type!.slice(1);
        document.title = `MovieBloKK ${this.siteType}`;
        this.log(`Navigation to ${this.siteType}`);

        return this.decideWhatToDo();
    }

    rebuild() {

        this.log(`Starting rebuild`);

        this.rebuildPage();

        this.debugElem = document.querySelector('pre')!;
        this.resultElem = document.querySelector('.article-result')! as HTMLElement;
        this.resultWrapper = this.resultElem.parentElement!;

        // setup our own navigation
        const menu = document.querySelector('.nav-menu')!;
        menu.addEventListener('click', this.navigate.bind(this));

        this.decideWhatToDo();
    }
}