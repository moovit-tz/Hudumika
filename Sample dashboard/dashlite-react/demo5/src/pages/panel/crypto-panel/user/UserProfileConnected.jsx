import React from "react";
import Head from "@/layout/head/Head";
import {
  BlockDes,
  BlockHead,
  BlockHeadContent,
  BlockTitle,
  Block,
  Icon,
} from "@/components/Component";
import { Card } from "reactstrap";
import { Link } from "react-router-dom";

const UserProfileConnectedPage = () => {
  return (
    <React.Fragment>
      <Head title="User List - Profile"></Head>
      <Block className="pt-3 pt-md-5">
        <BlockHead>
          <BlockHeadContent>
            <BlockTitle tag="h5">Connected with Social Account</BlockTitle>
            <BlockDes>
              <p>You can connect with your social account such as facebook, google etc to make easier to login into account.</p>
            </BlockDes>
          </BlockHeadContent>
        </BlockHead>
        <h6 className="lead-text">Connect to Facebook</h6>
        <Card className="card-bordered">
          <div className="card-inner">
            <div className="between-center flex-wrap flex-md-nowrap g-3">
                <div className="media media-center gx-3 wide-xs">
                    <div className="media-object">
                        <Icon name="facebook-f" className="icon-circle icon-circle-lg"></Icon>
                    </div>
                    <div className="media-content">
                        <p>You have successfully connected with your facebook account, you can easily log in using your account too.</p>
                    </div>
                </div>
                <div className="nk-block-actions flex-shrink-0">
                    <Link to="#" onClick={(ev) => ev.preventDefault()} className="btn btn-lg btn-danger">Revoke Access</Link>
                </div>
            </div>
          </div>
        </Card>
        <h6 className="lead-text">Connect to Google</h6>
        <Card className="card-bordered">
          <div className="card-inner">
            <div className="between-center flex-wrap flex-md-nowrap g-3">
                <div className="media media-center gx-3 wide-xs">
                    <div className="media-object">
                      <Icon name="google" className="icon-circle icon-circle-lg"></Icon>
                    </div>
                    <div className="media-content">
                        <p>You can connect with your google account. <em className="d-block text-soft">Not connected yet</em></p>
                    </div>
                </div>
                <div className="nk-block-actions flex-shrink-0">
                    <Link to="#" onClick={(ev) => ev.preventDefault()} className="btn btn-lg btn-light">Connect</Link>
                </div>
              </div>
            </div>
        </Card>
        <BlockHead size="sm">
          <BlockHeadContent>
            <BlockTitle tag="h6">Import Contacts <a href="#" className="link link-primary ms-auto">Import from Google</a></BlockTitle>
            <BlockDes>
            <p>You have not imported contacts from your mobile phone.</p>
            </BlockDes>
          </BlockHeadContent>
        </BlockHead>
      </Block>
    </React.Fragment>
  );
};
export default UserProfileConnectedPage;
