export interface BuiltInTheme {
	name: string;
	label: string;
	css: string;
}

export const BUILT_IN_THEME_NONE = '';

const SYSU2_CSS = `@charset "UTF-8";
/*!
 * Marp / Marpit SYSU2 theme.
 *
 * @theme sysu2
 * @auto-scaling true
 * @size 16:9 1280px 720px
 * @size 4:3 960px 720px
 */

@import "default";
@import url("https://cdn.jsdelivr.net/gh/cherryamme/Marp-theme_SYSU@latest/styles/vs2015.min.css");

h1 {
    color: #12532b;
    font-weight: 800;
}

h2 {
    color: #1e6439;
}

blockquote::after, blockquote::before {
    content: "“";
    display: block;
    font-weight: bold;
    position: absolute;
}
blockquote::before {
    top: 0;
    left: 0;
}
blockquote::after {
    right: 0;
    bottom: 0;
    transform: rotate(180deg);
}
blockquote {
    margin: 1em 0 0 0;
    padding: 0.3em 1em;
    position: relative;
    color: rgb(77, 77, 77);
    background-color: gainsboro;
    border-radius: 0.3em;
    font-size: 0.8em;
}

section:before {
    position: absolute;
    top: 0px;
    left: 0px;
    width: 100%;
    height: 3%;
    content: "";
    background: linear-gradient(90deg, #053b25, #9ac7b2);
}

section {
    overflow: auto !important;
    background-image: url("https://cdn.jsdelivr.net/gh/cherryamme/Marp-theme_SYSU@latest/img/logo.png");
    background-repeat: no-repeat;
    background-position: 102% 5%;
    background-size: auto 10%, 100% 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    padding-top: 3%;
    box-sizing: border-box;
}

h1 strong,
h2 strong,
h3 strong,
h4 strong,
h5 strong,
h6 strong {
    color: #025e23;
    background-color: #bae2d0;
}
mark,
strong {
    color: #025e23;
    background-color: #bae2d0;
}

code {
    color: darkslategray;
}

section[id='1'] {
    background-image: url("https://cdn.jsdelivr.net/gh/cherryamme/Marp-theme_SYSU@latest/img/logo-single.png");
    background-repeat: no-repeat;
    background-color: #e7fdf0;
    background-blend-mode: darken;
    background-position: 45% 5%;
    background-size: 55% auto, 100% 100%;
    text-align: center;
    justify-content: flex-start;
    padding-top: 24%;
}

div.twocols {
    margin-top: 35px;
    column-count: 2;
}
div.twocols p:first-child,
div.twocols h1:first-child,
div.twocols h2:first-child,
div.twocols ul:first-child,
div.twocols ul li:first-child,
div.twocols ul li p:first-child {
    margin-top: 0 !important;
}
div.twocols p.break {
    break-before: column;
    margin-top: 0;
}`;

export const BUILT_IN_THEMES: BuiltInTheme[] = [
	{
		name: 'sysu2',
		label: 'SYSU2',
		css: SYSU2_CSS,
	},
];

export function getBuiltInTheme(name: string): BuiltInTheme | undefined {
	return BUILT_IN_THEMES.find((theme) => theme.name === name);
}
