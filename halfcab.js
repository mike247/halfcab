import sheetRouter from 'sheet-router';
import href from 'sheet-router/href';
import history from 'sheet-router/history';
import html, {update} from 'yo-yo';
import axios, { get } from 'axios';
import cssInject from 'csjs-inject';
import merge from 'deepmerge';
import marked from 'marked';
import { AllHtmlEntities } from 'html-entities';
import geb, { eventEmitter } from './eventEmitter';

const entities = new AllHtmlEntities();
var cssTag = cssInject;
var componentCSSString = '';
var routesArray = [];
var baseApiPath = '';
var maxStates = 50;
var states = [];
var router;
var rootEl;
var components;

marked.setOptions({
    breaks: true
});

if(typeof window !== 'undefined'){
    var routerObject = {router: {pathname: window.location.pathname}};
    var dataInitial = document.querySelector('[data-initial]');
    if(!!dataInitial){
        states[0] = (dataInitial && dataInitial.dataset.initial) && Object.assign({}, JSON.parse(atob(dataInitial.dataset.initial)), routerObject);
    }
}else{

    cssTag = (cssStrings, ...values) => {
        var output = cssInject(cssStrings, ...values);
        componentCSSString += componentCSSString.indexOf(output[' css ']) === -1 ? output[' css '] : '';
        return output;
    };
}

function ssr(rootComponent){
    var componentsString = `${rootComponent}`;
    return { componentsString, stylesString: componentCSSString };
}

function route(routeObject, callback){
    routesArray.push(Object.assign(routeObject, {callback}));
}

function emptyBody(){
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
}

function formField(ob, prop){

    return e => {
        ob[prop] = e.currentTarget.value;
        console.log('---formField update---');
        console.log(prop, ob);
    }
}

function getLatestState(){
    return states[states.length-1];
}

function setMaxStates(num){
    maxStates = num;
}

function updateState(updateObject, options){

    if(options && options.deepMerge){
        states.push(Object.assign({}, merge(getLatestState(), updateObject)));
    }else{
        states.push(Object.assign({}, getLatestState(), updateObject));
    }
    if(states.length > maxStates){
        states.shift();
    }
    rootEl && update(rootEl, components(getLatestState()), {
        //morphdom options
        onBeforeElUpdated: (fromEl, toEl) => {

            //copy across mdc-web object to keep element updated
            if(fromEl.dataset.mdcAutoInit){
                var toDetails = Object.getOwnPropertyDescriptor(toEl, fromEl.dataset.mdcAutoInit);
                toDetails && toDetails.writable && (toEl[fromEl.dataset.mdcAutoInit] = fromEl[fromEl.dataset.mdcAutoInit]);
            }

            //if we return false, the element will not be updated
        }
    });

    if(process.env.NODE_ENV !== 'production'){
        console.log('------STATE UPDATE------');
        console.log(updateObject);
        console.log('  ');
        console.log('------NEW STATE------');
        console.log(getLatestState());
        console.log('  ');

    }
    return getLatestState();
}

function getApiData(config, r, params){
    //get data that the route needs first
    baseApiPath = config.baseApiPath || '';
    var startPromise;
    if(r.skipApiCall){

        startPromise = Promise.resolve({data: { data: null }});
    }else{
        startPromise = get(`${baseApiPath}${r.path}`)
    }
    return startPromise
        .then(data => {
            r.callback({apiData: data.data, params});
            if(window.location.pathname !== r.path){
                window.history.pushState({path: r.path}, r.title, r.path);
            }

            updateState({
                router: {
                    pathname: r.path
                }
            }, {
                deepMerge: true
            });

            document.title = r.path !== '' && r.title ? `${config.baseName} - ${r.title}`: config.baseName;
        })
        .catch(err => {
            console.log(err.toString());
        });
}

function injectHTML(htmlString){
    return html([`<div>${htmlString}</div>`]);//using html as a regular function instead of a tag function, and prevent double encoding of ampersands while we're at it
}

function injectMarkdown(mdString){
    return injectHTML(entities.decode(marked(mdString)));//using html as a regular function instead of a tag function, and prevent double encoding of ampersands while we're at it
}


export default function (config){
    //this default function is used for setting up client side and is not run on the server
    components = config.components;
    config.maxStates && setMaxStates(config.maxStates);
    return new Promise((resolve, reject) => {

        var routesFormatted = routesArray.map(r => [
            r.path,
            (params) =>{

                getApiData(config, r, params);

            }

        ]);

        router = sheetRouter({default: '/404'}, routesFormatted);

        href((location) =>{
            router(location.pathname);
        });

        history((location) => {
            router(location.pathname);
        });

        getApiData(config, { skipApiCall: !!dataInitial, path: location.pathname, callback: (output) => {
            output.apiData.data && updateState(output.apiData);
        }}).then(()=>{

            rootEl = components(getLatestState());
            resolve(rootEl);//root element generated by components
        })
    });
}

var cd = {};//empty object for storing client dependencies (or mocks or them on the server)

export {ssr, injectHTML, injectMarkdown, states, geb, eventEmitter, cd, html, route, updateState, emptyBody, formField, router, cssTag as css, axios as http};