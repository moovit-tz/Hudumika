import React, { useEffect, useLayoutEffect, Fragment } from "react";
import Icon from "@/components/icon/Icon";
import classNames from "classnames";
import Toggle from "../sidebar/Toggle";
import { NavLink, Link, useLocation } from "react-router";
import { slideUp, slideDown, getParents } from "@/utils/Utils";
import { useThemeUpdate } from '@/layout/provider/Theme';

// const MenuItem = ({ icon, link, text, sub, newTab, sidebarToggle, mobileView, badge, ...props }) => {
//   let currentUrl;

//   const toggleActionSidebar = (e) => {
//     if (!sub && !newTab && mobileView) {
//       sidebarToggle(e);
//     }
//   };

//   if (window.location.pathname !== undefined) {
//     currentUrl = window.location.pathname;
//   } else {
//     currentUrl = null;
//   }

//   const menuHeight = (el) => {
//     var totalHeight = [];
//     for (var i = 0; i < el.length; i++) {
//       var margin =
//         parseInt(window.getComputedStyle(el[i]).marginTop.slice(0, -2)) +
//         parseInt(window.getComputedStyle(el[i]).marginBottom.slice(0, -2));
//       var padding =
//         parseInt(window.getComputedStyle(el[i]).paddingTop.slice(0, -2)) +
//         parseInt(window.getComputedStyle(el[i]).paddingBottom.slice(0, -2));
//       var height = el[i].clientHeight + margin + padding;
//       totalHeight.push(height);
//     }
//     totalHeight = totalHeight.reduce((sum, value) => (sum += value));
//     return totalHeight;
//   };

//   const makeParentActive = (el, childHeight) => {
//     let element = el.parentElement.parentElement.parentElement;
//     let wrap = el.parentElement.parentElement;
//     if (element.classList[0] === "nk-menu-item") {
//       element.classList.add("active");
//       const subMenuHeight = menuHeight(el.parentNode.children);
//       wrap.style.height = subMenuHeight + childHeight - 50 + "px";
//       makeParentActive(element);
//     }
//   };

//   useEffect(() => {
//     var element = document.getElementsByClassName("nk-menu-item active current-page");
//     var arrayElement = [...element];

//     arrayElement.forEach((dom) => {
//       if (dom.parentElement.parentElement.parentElement.classList[0] === "nk-menu-item") {
//         dom.parentElement.parentElement.parentElement.classList.add("active");
//         const subMenuHeight = menuHeight(dom.parentNode.children);
//         dom.parentElement.parentElement.style.height = subMenuHeight + "px";
//         makeParentActive(dom.parentElement.parentElement.parentElement, subMenuHeight);
//       }
//     });
//   }, []); // eslint-disable-line react-hooks/exhaustive-deps

//   const menuToggle = (e) => {
//     e.preventDefault();
//     var self = e.target.closest(".nk-menu-toggle");
//     var parent = self.parentElement;
//     var subMenu = self.nextSibling;
//     var subMenuItem = subMenu.childNodes;
//     var parentSiblings = parent.parentElement.childNodes;
//     var parentMenu = parent.closest(".nk-menu-wrap");
//     //For Sub Menu Height
//     var subMenuHeight = menuHeight(subMenuItem);
//     // Get parent elements
//     const getParents = (el, parentSelector) => {
//       parentSelector = document.querySelector("#main-menu");
//       if (parentSelector === undefined) {
//         parentSelector = document;
//       }
//       var parents = [];
//       var p = el.parentNode;
//       while (p !== parentSelector) {
//         var o = p;
//         parents.push(o);
//         p = o.parentNode;
//       }
//       parents.push(parentSelector);
//       return parents;
//     };
//     var parentMenus = getParents(self);
//     if (!parent.classList.contains("active")) {
//       // For Parent Siblings
//       for (var j = 0; j < parentSiblings.length; j++) {
//         parentSiblings[j].classList.remove("active");
//         if (typeof parentSiblings[j].childNodes[1] !== "undefined") {
//           parentSiblings[j].childNodes[1].style.height = 0;
//         }
//       }
//       if (parentMenu !== null) {
//         if (!parentMenu.classList.contains("sub-opened")) {
//           parentMenu.classList.add("sub-opened");

//           for (var l = 0; l < parentMenus.length; l++) {
//             if (typeof parentMenus !== "undefined") {
//               if (parentMenus[l].classList.contains("nk-menu-wrap")) {
//                 parentMenus[l].style.height = subMenuHeight + parentMenus[l].clientHeight + "px";
//               }
//             }
//           }
//         }
//       }
//       // For Current Element
//       parent.classList.add("active");
//       subMenu.style.height = subMenuHeight + "px";
//     } else {
//       parent.classList.remove("active");
//       if (parentMenu !== null) {
//         parentMenu.classList.remove("sub-opened");
//         for (var k = 0; k < parentMenus.length; k++) {
//           if (typeof parentMenus !== "undefined") {
//             if (parentMenus[k].classList.contains("nk-menu-wrap")) {
//               parentMenus[k].style.height = parentMenus[k].clientHeight - subMenuHeight + "px";
//             }
//           }
//         }
//       }
//       subMenu.style.height = 0;
//     }
//   };

//   const menuItemClass = classNames({
//     "nk-menu-item": true,
//     "has-sub": sub,
//     "active current-page": currentUrl === link,
//   });
//   return (
//     <li className={menuItemClass} onClick={(e) => toggleActionSidebar(e)}>
//       {newTab ? (
//         <Link
//           to={`${link}`}
//           target="_blank"
//           rel="noopener noreferrer"
//           className="nk-menu-link sidebar-menu-link"
//         >
//           {icon ? (
//             <span className="nk-menu-icon">
//               <Icon name={icon} />
//             </span>
//           ) : null}
//           <span className="nk-menu-text">{text}</span>
//         </Link>
//       ) : (
//         <NavLink
//           to={`${link}`}
//           className={`nk-menu-link sidebar-menu-link${sub ? " nk-menu-toggle" : ""}`}
//           onClick={sub ? menuToggle : null}
//         >
//           {icon ? (
//             <span className="nk-menu-icon">
//               <Icon name={icon} />
//             </span>
//           ) : null}
//           <span className="nk-menu-text">{text}</span>
//           {badge && <span className="nk-menu-badge">{badge}</span>}
//         </NavLink>
//       )}
//       {sub ? (
//         <div className="nk-menu-wrap">
//           <MenuSub sub={sub} sidebarToggle={sidebarToggle} mobileView={mobileView} />
//         </div>
//       ) : null}
//     </li>
//   );
// };

// const MenuSub = ({ icon, link, text, sub, sidebarToggle, mobileView, ...props }) => {
//   return (
//     <ul className="nk-menu-sub" style={props.style}>
//       {sub.map((item) => (
//         <MenuItem
//           link={item.link}
//           icon={item.icon}
//           text={item.text}
//           sub={item.subMenu}
//           key={item.text}
//           badge={item.badge}
//           newTab={item.newTab}
//           sidebarToggle={sidebarToggle}
//           mobileView={mobileView}
//         />
//       ))}
//     </ul>
//   );
// };

const Menu = ({ currentMenuTab, data }) => {
  
const themeUpdate = useThemeUpdate();
const location = useLocation();

let currentLink = function(selector){
    let elm = document.querySelectorAll(selector);
    elm.forEach(function(item){
        var activeRouterLink = item.classList.contains('active');
        if (activeRouterLink) {
            let parents = getParents(item,`.nk-menu-wrapper`, 'nk-menu-item');
            parents.forEach(parentElemets =>{
                parentElemets.classList.add('active', 'current-page');
                let subItem = parentElemets.querySelector(`.nk-menu-wrap`);
                subItem !== null && (subItem.style.display = "block")
            })
            
        } else {
            item.parentElement.classList.remove('active', 'current-page');
        }
    })
} 
// dropdown toggle
let dropdownToggle = function(elm){
    let parent = elm.parentElement;
    let nextelm = elm.nextElementSibling;
    let speed = nextelm.children.length > 5 ? 400 + nextelm.children.length * 10 : 400;
    if(!parent.classList.contains('active')){
        parent.classList.add('active');
        slideDown(nextelm,speed);
    }else{
        parent.classList.remove('active');
        slideUp(nextelm,speed);
    }
}

// dropdown close siblings
let closeSiblings = function(elm){
    let parent = elm.parentElement;
    let siblings = parent.parentElement.children;
    Array.from(siblings).forEach(item => {
    if(item !== parent){
        item.classList.remove('active');
        if(item.classList.contains('has-sub')){
        let subitem = item.querySelectorAll(`.nk-menu-wrap`);
        subitem.forEach(child => {
            child.parentElement.classList.remove('active');
            slideUp(child,400);
        })
        }
    }
    });
}

let menuToggle = function(e){
    e.preventDefault();
    let item = e.target.closest(`.nk-menu-toggle`)
    dropdownToggle(item);
    closeSiblings(item);
}

let routeChange = function(e){
    let selector = document.querySelectorAll(".sidebar-menu-link")
    selector.forEach((item, index)=>{
        if(item.classList.contains('active')){
            closeSiblings(item);
            item.parentElement.classList.add("active");
        }else{
            item.parentElement.classList.remove("active");
            currentLink(`.sidebar-menu-link`);
        }
    })
}


let menuItem;

useLayoutEffect(() =>{
    routeChange();
    themeUpdate.sidebarHide();
},[location.pathname])

useLayoutEffect(() =>{
    currentLink(`.sidebar-menu-link`);
    // eslint-disable-next-line
},[null])

  return (
    <div className="nk-menu-wrapper">
      {data.map((dItem, dIndex) => 
        <div className={classNames({"nk-menu-content": true, 'menu-active' : dItem.heading === currentMenuTab  })} key={dIndex}>
          <div className="d-flex justify-between">
            <h5 className="title mt-1">{dItem.heading}</h5>
            <div className="mb-1">
              <Toggle icon="arrow-left" className="nk-nav-toggle nk-quick-nav-icon d-xl-none" click={themeUpdate.sidebarVisibility} />
            </div>
          </div>
          <ul className="nk-menu sidebar-menu">
            {dItem.subMenu.map((item,index) => 
              <li className={classNames({'nk-menu-item': true, 'has-sub' : item.subMenu})} key={index}>
                {!item.subMenu ? (
                  <NavLink to={item.link} className="nk-menu-link sidebar-menu-link" target={item.newTab && '_blank'} end>
                    {item.icon  && <span className="nk-menu-icon">
                      <Icon name={item.icon} />
                    </span>}
                    <span className="nk-menu-text">{item.text}</span>
                    {item.badge && <span className="nk-menu-badge">{item.badge}</span>}
                  </NavLink>
                  ) : (
                  <>
                    <a href="#" className="nk-menu-link sidebar-menu-link nk-menu-toggle" onClick={menuToggle}>
                      {item.icon  && <span className="nk-menu-icon">
                        <Icon name={item.icon} />
                      </span>}
                      <span className="nk-menu-text">{item.text}</span>
                      {item.badge && <span className="nk-menu-badge">{item.badge}</span>}
                    </a>
                    <div className="nk-menu-wrap">
                      <ul className="nk-menu-sub">
                        {item.subMenu.map((sItem, sIndex) =>
                          <li className={classNames({'nk-menu-item': true, 'has-sub' : sItem.subMenu})} key={sIndex}>
                              {!sItem.subMenu ? (
                                <NavLink to={sItem.link} className="nk-menu-link sidebar-menu-link" target={sItem.newTab && '_blank'} end>
                                  <span className="nk-menu-text">{sItem.text}</span>
                                  {sItem.badge && <span className="nk-menu-badge">{sItem.badge}</span>}
                                </NavLink>
                                ) : (
                                <>
                                  <a href="#" className="nk-menu-link sidebar-menu-link nk-menu-toggle" onClick={menuToggle}>
                                    <span className="nk-menu-text">{sItem.text}</span>
                                    {sItem.badge && <span className="nk-menu-badge">{sItem.badge}</span>}
                                  </a>
                                  <div className="nk-menu-wrap">
                                    <ul className="nk-menu-sub">
                                      {sItem.subMenu.map((s2Item, s2Index) =>
                                        <li className={classNames({'nk-menu-item': true, 'has-sub' : s2Item.subMenu})} key={s2Index}>
                                            {!s2Item.subMenu ? (
                                              <NavLink to={s2Item.link} className="nk-menu-link sidebar-menu-link" target={s2Item.newTab && '_blank'} end>
                                                <span className="nk-menu-text">{s2Item.text}</span>
                                                {s2Item.badge && <span className="nk-menu-badge">{s2Item.badge}</span>}
                                              </NavLink>
                                              ) : (
                                              <>
                                                <a href="#" className="nk-menu-link sidebar-menu-link nk-menu-toggle" onClick={menuToggle}>
                                                  <span className="nk-menu-text">{s2Item.text}</span>
                                                  {s2Item.badge && <span className="nk-menu-badge">{s2Item.badge}</span>}
                                                </a>
                                                <div className="nk-menu-wrap">
                                                  <ul className="nk-menu-sub">
                                                    {s2Item.subMenu.map((s3Item, s3Index) =>
                                                      <li className="nk-menu-item" key={s3Index}>
                                                          <NavLink to={s3Item.link} className="nk-menu-link sidebar-menu-link" target={s3Item.newTab && '_blank'} end>
                                                            <span className="nk-menu-text">{s3Item.text}</span>
                                                            {s3Item.badge && <span className="nk-menu-badge">{s3Item.badge}</span>}
                                                          </NavLink>
                                                      </li>
                                                    )}
                                                  </ul>
                                                </div>
                                              </>
                                            )}
                                        </li>
                                      )}
                                    </ul>
                                  </div>
                                </>
                              )}
                          </li>
                        )}
                      </ul>
                    </div>
                  </>
                )}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default Menu;
