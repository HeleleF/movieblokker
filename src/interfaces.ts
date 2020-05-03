export interface Article {
    title: string;
    link: string;
    caption: string;
    date: string;
    img: string | null;
}

export enum MBMeta {
    LENGTH,
    SIZE,
    FORMAT
}

export interface MBComment {
    author: string;
    from: string;
    message: string;
}

export interface MBLink {
    hoster: string;
    link: string;
}

export interface MBRelease {
    releaseName?: string;
    mirrors: MBLink[];
    password?: string;
}

export interface MBGroup {
    groupName?: string;
    releases: MBRelease[];
}

export interface ArticleInfo {

    releaseName: string;
    description: string;

    additionalReleaseInformation?: string;
    additionalNotes?: string;
    additionalNotesBetweenLinks?: string;

    imageSrc: string;

    length?: string;
    format?: string;
    size?: string;

    sampleLink?: string;

    downloadGroups: MBGroup[];
    password?: string;

    date: string;
    categories: string[];

    comments: MBComment[];
}

export interface Row {
    id: string;
    content: [Article, Article, Article, Article]
}

export interface ScrollItem {
    data: Row | null;
    node: HTMLDivElement | null;
    height: number;
    width: number;
    top: number;
}

export interface Anchor {
    index: number;
    offset: number;
}

export interface TombstoneAnimations {
    [key: number]: any[];
}