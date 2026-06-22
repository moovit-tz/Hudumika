import React, { useEffect, useLayoutEffect, Fragment } from "react";
import classNames from "classnames";
import Icon from "@/components/icon/Icon";
import { NavLink, Link, useLocation } from "react-router";
import { getParents } from "@/utils/Utils";
import { useThemeUpdate } from '@/layout/provider/Theme';

const Menu = ({data}) => {
  const themeUpdate = useThemeUpdate();
  const location = useLocation();

  let currentLink = function(selector){
      let elm = document.querySelectorAll(selector);
      elm.forEach(function(item){
          var activeRouterLink = item.classList.contains('active');
          if (activeRouterLink) {
              let parents = getParents(item,`.nk-menu-main`, 'nk-menu-item');
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

  let routeChange = function(e){
      let selector = document.querySelectorAll(".header-menu-link")
      selector.forEach((item, index)=>{
        currentLink(`.header-menu-link`);
      })
  }
  
  useLayoutEffect(() =>{
      routeChange();
  },[location.pathname])

  useEffect(() =>{
      currentLink(`.header-menu-link`);
      // eslint-disable-next-line
  },[null])

  return (
    <ul className={classNames({"nk-menu nk-menu-main":true})}>
    {data.map((item, index) =>
      <li className={classNames({'nk-menu-item': true, 'has-sub' : item.subMenu})} key={index}>
        {!item.subMenu ? (
          <NavLink to={item.link} className="nk-menu-link header-menu-link" target={item.newTab && '_blank'} end>
            <span className="nk-menu-text">{item.text}</span>
            {item.badge && <span className="nk-menu-badge">{item.badge}</span>}
          </NavLink>
          ) : (
          <>
            <a href="#" className="nk-menu-link header-menu-link nk-menu-toggle">
              <span className="nk-menu-text">{item.text}</span>
              {item.badge && <span className="nk-menu-badge">{item.badge}</span>}
            </a>
            <ul className="nk-menu-sub">
              {item.subMenu.map((sItem, sIndex) =>
                <Fragment key={sIndex}>
                  {sItem.heading ? (
                    <li className="nk-menu-heading">
                      <h6 className="overline-title text-primary">{sItem.heading}</h6>
                    </li>
                  ) : (
                    <li className={classNames({'nk-menu-item': true, 'has-sub' : sItem.subMenu})} >
                        {!sItem.subMenu ? (
                          <NavLink to={sItem.link} className="nk-menu-link header-menu-link" target={sItem.newTab && '_blank'} end>
                            <span className="nk-menu-text">{sItem.text}</span>
                            {sItem.badge && <span className="nk-menu-badge">{sItem.badge}</span>}
                          </NavLink>
                          ) : (
                          <>
                            <a href="#" className="nk-menu-link header-menu-link nk-menu-toggle">
                              <span className="nk-menu-text">{sItem.text}</span>
                              {sItem.badge && <span className="nk-menu-badge">{sItem.badge}</span>}
                            </a>
                              <ul className="nk-menu-sub">
                                {sItem.subMenu.map((s2Item, s2Index) =>
                                  <li className={classNames({'nk-menu-item': true, 'has-sub' : s2Item.subMenu})} key={s2Index}>
                                      {!s2Item.subMenu ? (
                                        <NavLink to={s2Item.link} className="nk-menu-link header-menu-link" target={s2Item.newTab && '_blank'} end>
                                          <span className="nk-menu-text">{s2Item.text}</span>
                                          {s2Item.badge && <span className="nk-menu-badge">{s2Item.badge}</span>}
                                        </NavLink>
                                        ) : (
                                        <>
                                          <a href="#" className="nk-menu-link header-menu-link nk-menu-toggle">
                                            <span className="nk-menu-text">{s2Item.text}</span>
                                            {s2Item.badge && <span className="nk-menu-badge">{s2Item.badge}</span>}
                                          </a>
                                            <ul className="nk-menu-sub">
                                              {s2Item.subMenu.map((s3Item, s3Index) =>
                                                <li className="nk-menu-item" key={s3Index}>
                                                    <NavLink to={s3Item.link} className="nk-menu-link header-menu-link" target={s3Item.newTab && '_blank'} end>
                                                      <span className="nk-menu-text">{s3Item.text}</span>
                                                      {s3Item.badge && <span className="nk-menu-badge">{s3Item.badge}</span>}
                                                    </NavLink>
                                                </li>
                                              )}
                                            </ul>
                                        </>
                                      )}
                                  </li>
                                )}
                              </ul>
                          </>
                        )}
                    </li>
                  )}
                </Fragment>
              )}
            </ul>
          </>
        )}
      </li>
    )}
  </ul>
  );
};


export default Menu;
