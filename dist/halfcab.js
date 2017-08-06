'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var sheetRouter = _interopDefault(require('sheet-router'));
var href = _interopDefault(require('sheet-router/href'));
var history = _interopDefault(require('sheet-router/history'));
var html = _interopDefault(require('bel'));
var update = _interopDefault(require('mdc-nanomorph'));
var axios = require('axios');
var axios__default = _interopDefault(axios);
var cssInject = _interopDefault(require('csjs-inject'));
var merge = _interopDefault(require('deepmerge'));
var marked = _interopDefault(require('marked'));
var htmlEntities = require('html-entities');
var ee = _interopDefault(require('event-emitter'));

var events = ee({});

function eventEmitter(){

    var noop = () => {};

    if(typeof window !== 'undefined'){
        function broadcast(eventName, eventObject){

            //Set a break point on the following line to monitor all events being broadcast
            console.log('Event broadcast: '+ eventName);
            events.emit(eventName, eventObject);
        }

        function on(eventName, cb){

            //Set a break point on the following line to monitor all events being listened to
            events.on(eventName, cb);
        }

        function once(eventName, cb){

            //Set a break point on the following line to monitor all events being listened to just once
            events.once(eventName, cb);
        }

        function off(eventName, listenerFunction){

            //Set a break point on the following line to monitor all events being unlistened to
            events.off(eventName, listenerFunction);
        }

        return {
            broadcast: broadcast,
            on: on,
            once: once,
            off: off
        }
    }else{
        return {
            broadcast: noop,
            on: noop,
            once: noop,
            off: noop
        }
    }

}

var index = new eventEmitter();

let componentRegistry;
let entities = new htmlEntities.AllHtmlEntities();
exports.css = cssInject;
let componentCSSString = '';
let routesArray = [];
let baseApiPath = '';
exports.state = {};
let router;
let rootEl;
let components;
let postUpdate;
let dataInitial;

marked.setOptions({
    breaks: true
});

if(typeof window !== 'undefined'){
    componentRegistry = new Map();
    dataInitial = document.querySelector('[data-initial]');
    if(!!dataInitial){
        exports.state = (dataInitial && dataInitial.dataset.initial) && Object.assign({}, JSON.parse(atob(dataInitial.dataset.initial)));
        if(!exports.state.router.pathname){
            Object.assign(exports.state.router, {pathname: window.location.pathname, query: window.location.search});
        }
    }
}else{

    exports.css = (cssStrings, ...values) => {
        let output = cssInject(cssStrings, ...values);
        componentCSSString += componentCSSString.indexOf(output[' css ']) === -1 ? output[' css '] : '';
        return output
    };
}

function ssr(rootComponent){
    let componentsString = `${rootComponent}`;
    return { componentsString, stylesString: componentCSSString }
}

function defineRoute(routeObject, callback){
    routesArray.push(Object.assign(routeObject, {callback}));
}

function emptyBody(){
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
}

function formField(ob, prop){

    return e => {
        ob[prop] = e.currentTarget.type === 'checkbox' || e.currentTarget.type === 'radio' ? e.currentTarget.checked : e.currentTarget.value;
        let validOb;
        if(!ob.valid){
            if(Object.getOwnPropertySymbols(ob).length > 0){
                Object.getOwnPropertySymbols(ob).forEach(symb => {
                    if(symb.toString() === 'Symbol(valid)'){
                        validOb = symb;
                    }
                });
            }else{
                ob.valid = {};
                validOb = 'valid';
            }

        }else{
            validOb = 'valid';
        }
        ob[validOb][prop] = e.currentTarget.validity.valid;
        console.log('---formField update---');
        console.log(prop, ob);
        console.log(`Valid? ${ob[validOb][prop]}`);
    }
}

function formIsValid(holidingPen){
    let validProp = holidingPen.valid && 'valid';
    if(!validProp){
        Object.getOwnPropertySymbols(holidingPen).forEach(symb => {
            if(symb.toString() === 'Symbol(valid)'){
                validProp = symb;
            }
        });

        if(!validProp){
            return false
        }
    }

    let validOb = Object.keys(holidingPen[validProp]);

    for(let i = 0; i < validOb.length; i ++){
        if(holidingPen[validProp][validOb[i]] !== true){
            return false
        }
    }

    return true
}

let waitingAlready = false;
function debounce(func) {
    if(!waitingAlready){
        waitingAlready = true;
        requestAnimationFrame(() => {
            func();
            waitingAlready = false;
        });
    }
}

function stateUpdated(){
    rootEl && update(rootEl, components(exports.state));
    postUpdate && postUpdate();
}


function updateState(updateObject, options){

    if(updateObject){
        if(options && options.deepMerge === false){
            Object.assign(exports.state, updateObject);
        }else{
            exports.state = merge(exports.state, updateObject);
        }
    }

    debounce(stateUpdated);


    if(process.env.NODE_ENV !== 'production'){
        console.log('------STATE UPDATE------');
        console.log(updateObject);
        console.log('  ');
        console.log('------NEW STATE------');
        console.log(exports.state);
        console.log('  ');

    }
}

function getApiData(config, r, params){
    //get data that the route needs first
    baseApiPath = config.baseApiPath || '';
    postUpdate = config.postUpdate;
    let startPromise;
    if(r.skipApiCall){

        startPromise = Promise.resolve({data: { data: null }});
    }else{
        startPromise = axios.get(`${baseApiPath}${r.path}`);
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
        })
}

function injectHTML(htmlString){
    return html([`<div>${htmlString}</div>`])//using html as a regular function instead of a tag function, and prevent double encoding of ampersands while we're at it
}

function injectMarkdown(mdString){
    return injectHTML(entities.decode(marked(mdString)))//using html as a regular function instead of a tag function, and prevent double encoding of ampersands while we're at it
}

function cache(c, args){

    if(typeof window === 'undefined'){
        return c(args)
    }

    let key = c.toString() + JSON.stringify(args);

    if(!componentRegistry.has(key)){

        //not already in the registry, add it
        let el = c(args);
        componentRegistry.set(key, el);
        return el
    }else{
        return componentRegistry.get(key)
    }

}

function gotoRoute(route){
    return router(route)
        .then((component) => {
            updateState({
                router: {
                    component
                }
            });
        })
}

function getRouteComponent(pathname){
    let foundRoute = routesArray.find(route => route.path === pathname);
    return foundRoute && foundRoute.component
}


var halfcab = function (config){
    //this default function is used for setting up client side and is not run on the server
    components = config.components;
    return new Promise((resolve, reject) => {

        let routesFormatted = routesArray.map(r => [
            r.path,
            params =>{

                return getApiData(config, r, params)
                    .then(() => {
                        return r.component
                    })

            }

        ]);

        router = sheetRouter({default: '/404'}, routesFormatted);

        href((location) =>{
            router(location.href);
        });

        history((location) => {
            router(location.href);
        });

        getApiData(config, { skipApiCall: !!dataInitial, path: location.pathname, callback: (output) => {
            output.apiData.data && updateState({data: {[location.pathname]: output.apiData.data}});
        }}).then(()=>{

            rootEl = components(exports.state);
            resolve(rootEl);//root element generated by components
        });
    })
};

let cd = {};//empty object for storing client dependencies (or mocks or them on the server)

exports['default'] = halfcab;
exports.getRouteComponent = getRouteComponent;
exports.cache = cache;
exports.formIsValid = formIsValid;
exports.ssr = ssr;
exports.injectHTML = injectHTML;
exports.injectMarkdown = injectMarkdown;
exports.geb = index;
exports.eventEmitter = eventEmitter;
exports.cd = cd;
exports.html = html;
exports.defineRoute = defineRoute;
exports.updateState = updateState;
exports.emptyBody = emptyBody;
exports.formField = formField;
exports.gotoRoute = gotoRoute;
exports.http = axios__default;
