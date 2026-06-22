import React from "react";

const Content = ({ ...props }) => {
  return (
    <div className="nk-content-wrap">
      {!props.page ? props.children : null}
      {props.page === "component" ? <div className="components-preview wide-md mx-auto">{props.children}</div> : null}
    </div>
  );
};
export default Content;
