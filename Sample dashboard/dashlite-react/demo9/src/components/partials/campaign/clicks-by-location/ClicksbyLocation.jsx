import React from 'react';
import { Card, UncontrolledDropdown, DropdownMenu, DropdownToggle } from 'reactstrap';
import { Icon } from '@/components/Component';

const data = [
  {name:'United States',amount:"14,356"},
  {name:'Ireland',amount:"11,203"},
  {name:'United Kingdom',amount:"10,653"},
  {name:"Canada",amount:"7,215"},
  {name:"Australia",amount:"6,653"},
  {name:"Japan",amount:"3,945"},
  {name:"China",amount:"2,945"},
  {name:"France",amount:"954"},
]

const ClicksbyLocation = () => {
  return (
    <Card className="card-full">
        <div className="card-inner">
            <div className="card-title-group">
                <div className="card-title">
                    <h6 className="title">Clicks by location</h6>
                </div>
                <div className="card-tools me-n1 mt-n1">
                    <UncontrolledDropdown>
                        <DropdownToggle className="btn-icon" color="trigger"><Icon name="more-h"></Icon></DropdownToggle>
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
            <ul className="my-n2">
                {data.map((item,index) =>
                  <li key={index} className={`align-center justify-between py-1 gx-1 ${(index < data.length - 1) ? "border-bottom border-0 border-dashed" : ""}`}>
                      <div className="lead-text">{item.name}</div>
                      <div className="sub-text">{item.amount}</div>
                  </li>
                )}
            </ul>
        </div>
    </Card>
  )
}

export default ClicksbyLocation