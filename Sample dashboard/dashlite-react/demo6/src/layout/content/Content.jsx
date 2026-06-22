import React from "react";

const Content = ({ ...props }) => {
  return (
    <div className={`nk-content nk-content-fluid ${props.size ? `nk-content-${props.size}` : ""}`}>
      <div className={`container-xl wide-${window.location.pathname.split("/")[2] === "invest" ? "lg" : "xl"}`}>
        <div className="nk-content-inner">
          <div className="nk-content-body">
            {!props.page ? props.children : null}
            {props.page === "component" ? (
              <div className="components-preview wide-md mx-auto">{props.children}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
export default Content;
