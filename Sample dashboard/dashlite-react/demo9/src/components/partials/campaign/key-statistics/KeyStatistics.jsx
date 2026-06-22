import React from 'react';
import { Card, UncontrolledDropdown, DropdownMenu, DropdownToggle } from 'reactstrap';
import { Icon } from '@/components/Component';

const data = [
    {
        title:"Average Like",
        amount:"85.6K",
        progress: "54%",
        theme: "primary",
        daterange: "Dec 22 - Feb 22",
    },
    {
        title:"Average Comments",
        amount:"42.7K",
        progress: "84%",
        theme: "danger",
        daterange: "Dec 22 - Feb 22",
    },
    {
        title:"Average Shares",
        amount:"25.4K",
        progress: "62%",
        theme: "success",
        daterange: "Dec 22 - Feb 22",
    },
]

const KeyStatistics = () => {
  return (
    <Card className="card-full">
        <div className="card-inner">
            <div className="card-title-group">
                <div className="card-title">
                    <h6 className="title">Key Statistics</h6>
                </div>
                <div className="card-tools me-n1 mt-n1">
                    <UncontrolledDropdown>
                        <DropdownToggle className="btn btn-icon" color="trigger"><Icon name="more-h"></Icon></DropdownToggle>
                        <DropdownMenu end className="dropdown-menu-sm">
                            <ul className="link-list-opt no-bdr">
                                <li><a href="#" className="active"><span>15 Days</span></a></li>
                                <li><a href="#"><span>30 Days</span></a></li>
                                <li><a href="#"><span>3 Months</span></a></li>
                            </ul>
                        </DropdownMenu>
                    </UncontrolledDropdown>
                </div>
            </div>
        </div>
        <div className="card-inner pt-0">
            <ul className="gy-4">
                {data.map((item,index) =>
                    <li key={index} className={(index < data.length - 1) ? "border-bottom border-0 border-dashed" : ""}>
                        <div className="mb-1">
                            <span className="fs-2 lh-1 mb-1 text-head">{item.amount}</span>
                            <div className="sub-text">{item.title}</div>
                        </div>
                        <div className="align-center">
                            <div className="small text-primary me-2">{item.progress}</div>
                            <div className={`progress progress-md rounded-pill w-100 bg-${item.theme}-dim`}>
                                <div className={`progress-bar bg-${item.theme} rounded-pill`} style={{width:item.progress}}></div>
                            </div>
                            <UncontrolledDropdown className="ms-3">
                                <DropdownToggle tag="a" type="button" className="dropdown dropdown-toggle dropdown-indicator sub-text" offset="0, 10">{item.daterange}</DropdownToggle>
                                <DropdownMenu end className="text-right">
                                    <ul className="link-list-opt">
                                    <li><a href="#"><span>Dec 22 - Feb 22</span></a></li>
                                    <li><a href="#"><span>Oct 22 - Dec 22</span></a></li>
                                    <li><a href="#"><span>Aug 22 - Oct 22</span></a></li>
                                    <li><a href="#"><span>Jun 22 - Aug 22</span></a></li>
                                    </ul>
                                </DropdownMenu>
                            </UncontrolledDropdown>
                        </div>
                    </li>
                )}
            </ul>
        </div>
    </Card>
  )
}

export default KeyStatistics