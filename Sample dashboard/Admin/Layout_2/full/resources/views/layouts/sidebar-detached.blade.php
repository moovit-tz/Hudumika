<!-- Main sidebar -->
<div class="sidebar sidebar-dark sidebar-main sidebar-expand-lg sidebar-main-resized">

    <!-- Sidebar header -->
    <div class="sidebar-section bg-black bg-opacity-10 border-bottom border-bottom-white border-opacity-10">
        <div class="sidebar-logo d-flex justify-content-center align-items-center">
            <a href="index" class="d-inline-flex align-items-center py-2">
                <img src="{{URL::asset('assets/images/logo_icon.svg')}}" class="sidebar-logo-icon" alt="">
                <img src="{{URL::asset('assets/images/logo_text_light.svg')}}" class="sidebar-resize-hide ms-3" height="14" alt="">
            </a>

            <div class="sidebar-resize-hide ms-auto">
                <button type="button" class="btn btn-flat-white btn-icon btn-sm rounded-pill border-transparent sidebar-control sidebar-main-resize d-none d-lg-inline-flex">
                    <i class="ph-arrows-left-right"></i>
                </button>

                <button type="button" class="btn btn-flat-white btn-icon btn-sm rounded-pill border-transparent sidebar-mobile-main-toggle d-lg-none">
                    <i class="ph-x"></i>
                </button>
            </div>
        </div>
    </div>
    <!-- /sidebar header -->


    <!-- Sidebar content -->
    <div class="sidebar-content">

        <!-- Customers -->
        <div class="sidebar-section sidebar-resize-hide dropdown mx-2">
            <a href="#" class="btn btn-link text-body text-start lh-1 dropdown-toggle p-2 my-1 w-100" data-bs-toggle="dropdown" data-color-theme="dark">
                <div class="hstack gap-2 flex-grow-1 my-1">
                    <img src="{{URL::asset('assets/images/brands/shell.svg')}}" class="w-32px h-32px" alt="">
                    <div class="me-auto">
                        <div class="fs-sm text-white opacity-75 mb-1">Customer</div>
                        <div class="fw-semibold">Royal Dutch Shell</div>
                    </div>
                </div>
            </a>

            <div class="dropdown-menu w-100">
                <a href="#" class="dropdown-item hstack gap-2 py-2">
                    <img src="{{URL::asset('assets/images/brands/tesla.svg')}}" class="w-32px h-32px" alt="">
                    <div>
                        <div class="fw-semibold">Tesla Motors Inc</div>
                        <div class="fs-sm text-muted">42 users</div>
                    </div>
                </a>
                <a href="#" class="dropdown-item hstack gap-2 py-2">
                    <img src="{{URL::asset('assets/images/brands/debijenkorf.svg')}}" class="w-32px h-32px" alt="">
                    <div>
                        <div class="fw-semibold">De Bijenkorf</div>
                        <div class="fs-sm text-muted">49 users</div>
                    </div>
                </a>
                <a href="#" class="dropdown-item hstack gap-2 py-2">
                    <img src="{{URL::asset('assets/images/brands/klm.svg')}}" class="w-32px h-32px" alt="">
                    <div>
                        <div class="fw-semibold">Royal Dutch Airlines</div>
                        <div class="fs-sm text-muted">18 users</div>
                    </div>
                </a>
                <a href="#" class="dropdown-item hstack gap-2 active py-2">
                    <img src="{{URL::asset('assets/images/brands/shell.svg')}}" class="w-32px h-32px" alt="">
                    <div>
                        <div class="fw-semibold">Royal Dutch Shell</div>
                        <div class="fs-sm text-muted">54 users</div>
                    </div>
                </a>
                <a href="#" class="dropdown-item hstack gap-2 py-2">
                    <img src="{{URL::asset('assets/images/brands/bp.svg')}}" class="w-32px h-32px" alt="">
                    <div>
                        <div class="fw-semibold">BP plc</div>
                        <div class="fs-sm text-muted">23 users</div>
                    </div>
                </a>
            </div>
        </div>
        <!-- /customers -->


        <!-- Main navigation -->
        <div class="sidebar-section">
            <ul class="nav nav-sidebar" id="navbar-nav" data-nav-type="accordion">

                <!-- Main -->
                <li class="nav-item-header">
                    <div class="text-uppercase fs-sm lh-sm opacity-50 sidebar-resize-hide">Main</div>
                    <i class="ph-dots-three sidebar-resize-show"></i>
                </li>
                <li class="nav-item">
                    <a href="index" class="nav-link">
                        <i class="ph-house"></i>
                        <span>
                            Dashboard
                            <span class="d-block fw-normal opacity-50">No pending orders</span>
                        </span>
                    </a>
                </li>
                <li class="nav-item nav-item-submenu">
                    <a href="#" class="nav-link">
                        <i class="ph-swatches"></i>
                        <span>Themes</span>
                    </a>
                    <ul class="nav-group-sub collapse">
                        <li class="nav-item"><a href="index" class="nav-link active">Default</a></li>
                        <li class="nav-item"><a href="javascript::void(0)" class="nav-link disabled">Material <span class="badge align-self-center ms-auto">Coming soon</span></a></li>
                        <li class="nav-item"><a href="javascript::void(0)" class="nav-link disabled">Clean <span class="badge align-self-center ms-auto">Coming soon</span></a></li>
                    </ul>
                </li>
                <li class="nav-item">
                    <a href="javascript::void(0)" class="nav-link">
                        <i class="ph-list-numbers"></i>
                        <span>Changelog</span>
                        <span class="badge bg-primary align-self-center rounded-pill ms-auto">4.0</span>
                    </a>
                </li>

                <!-- Layout -->
                <li class="nav-item-header">
                    <div class="text-uppercase fs-sm lh-sm opacity-50 sidebar-resize-hide">Layout</div>
                    <i class="ph-dots-three sidebar-resize-show"></i>
                </li>
                <li class="nav-item nav-item-submenu">
                    <a href="#" class="nav-link">
                        <i class="ph-layout"></i>
                        <span>Page layouts</span>
                    </a>

                    <ul class="nav-group-sub collapse">
                        <li class="nav-item"><a href="layout_static" class="nav-link">Static layout</a></li>
                        <li class="nav-item"><a href="layout_no_header" class="nav-link">No header</a></li>
                        <li class="nav-item"><a href="layout_no_footer" class="nav-link">No footer</a></li>
                        <li class="nav-item-divider"></li>
                        <li class="nav-item"><a href="layout_fixed_header" class="nav-link">Fixed header</a></li>
                        <li class="nav-item"><a href="layout_fixed_footer" class="nav-link">Fixed footer</a></li>
                        <li class="nav-item-divider"></li>
                        <li class="nav-item"><a href="layout_2_sidebars_1_side" class="nav-link">2 sidebars on 1 side</a></li>
                        <li class="nav-item"><a href="layout_2_sidebars_2_sides" class="nav-link">2 sidebars on 2 sides</a></li>
                        <li class="nav-item"><a href="layout_3_sidebars" class="nav-link">3 sidebars</a></li>
                        <li class="nav-item-divider"></li>
                        <li class="nav-item"><a href="layout_boxed_page" class="nav-link">Boxed page</a></li>
                        <li class="nav-item"><a href="layout_boxed_content" class="nav-link">Boxed content</a></li>
                    </ul>
                </li>
                <li class="nav-item nav-item-submenu">
                    <a href="#" class="nav-link">
                        <i class="ph-columns"></i>
                        <span>Sidebars</span>
                    </a>
                    <ul class="nav-group-sub collapse">
                        <li class="nav-item nav-item-submenu">
                            <a href="#" class="nav-link">Main sidebar</a>
                            <ul class="nav-group-sub collapse">
                                <li class="nav-item"><a href="sidebar_default_resizable" class="nav-link">Resizable</a></li>
                                <li class="nav-item"><a href="sidebar_default_resized" class="nav-link">Resized</a></li>
                                <li class="nav-item"><a href="sidebar_default_collapsible" class="nav-link">Collapsible</a></li>
                                <li class="nav-item"><a href="sidebar_default_collapsed" class="nav-link">Collapsed</a></li>
                                <li class="nav-item"><a href="sidebar_default_hideable" class="nav-link">Hideable</a></li>
                                <li class="nav-item"><a href="sidebar_default_hidden" class="nav-link">Hidden</a></li>
                                <li class="nav-item-divider"></li>
                                <li class="nav-item"><a href="sidebar_default_color_light" class="nav-link">Light color</a></li>
                            </ul>
                        </li>
                        <li class="nav-item nav-item-submenu">
                            <a href="#" class="nav-link">Secondary sidebar</a>
                            <ul class="nav-group-sub collapse">
                                <li class="nav-item"><a href="sidebar_secondary_collapsible" class="nav-link">Collapsible</a></li>
                                <li class="nav-item"><a href="sidebar_secondary_collapsed" class="nav-link">Collapsed</a></li>
                                <li class="nav-item"><a href="sidebar_secondary_hideable" class="nav-link">Hideable</a></li>
                                <li class="nav-item"><a href="sidebar_secondary_hidden" class="nav-link">Hidden</a></li>
                                <li class="nav-item-divider"></li>
                                <li class="nav-item"><a href="sidebar_secondary_color_dark" class="nav-link">Dark color</a></li>
                            </ul>
                        </li>
                        <li class="nav-item nav-item-submenu">
                            <a href="#" class="nav-link">Right sidebar</a>
                            <ul class="nav-group-sub collapse">
                                <li class="nav-item"><a href="sidebar_right_collapsible" class="nav-link">Collapsible</a></li>
                                <li class="nav-item"><a href="sidebar_right_collapsed" class="nav-link">Collapsed</a></li>
                                <li class="nav-item"><a href="sidebar_right_hideable" class="nav-link">Hideable</a></li>
                                <li class="nav-item"><a href="sidebar_right_hidden" class="nav-link">Hidden</a></li>
                                <li class="nav-item-divider"></li>
                                <li class="nav-item"><a href="sidebar_right_color_dark" class="nav-link">Dark color</a></li>
                            </ul>
                        </li>
                        <li class="nav-item nav-item-submenu">
                            <a href="#" class="nav-link">Content sidebar</a>
                            <ul class="nav-group-sub collapse">
                                <li class="nav-item"><a href="sidebar_content_left" class="nav-link">Left aligned</a></li>
                                <li class="nav-item"><a href="sidebar_content_left_stretch" class="nav-link">Left stretched</a></li>
                                <li class="nav-item"><a href="sidebar_content_left_sections" class="nav-link">Left sectioned</a></li>
                                <li class="nav-item"><a href="sidebar_content_right" class="nav-link">Right aligned</a></li>
                                <li class="nav-item"><a href="sidebar_content_right_stretch" class="nav-link">Right stretched</a></li>
                                <li class="nav-item"><a href="sidebar_content_right_sections" class="nav-link">Right sectioned</a></li>
                                <li class="nav-item-divider"></li>
                                <li class="nav-item"><a href="sidebar_content_color_dark" class="nav-link">Dark color</a></li>
                            </ul>
                        </li>
                        <li class="nav-item-divider"></li>
                        <li class="nav-item nav-item-submenu">
                            <a href="#" class="nav-link">Sticky areas</a>
                            <ul class="nav-group-sub collapse">
                                <li class="nav-item"><a href="sidebar_sticky_header" class="nav-link">Header</a></li>
                                <li class="nav-item"><a href="sidebar_sticky_footer" class="nav-link">Footer</a></li>
                                <li class="nav-item"><a href="sidebar_sticky_header_footer" class="nav-link">Header and footer</a></li>
                                <li class="nav-item"><a href="sidebar_sticky_custom" class="nav-link">Custom elements</a></li>
                            </ul>
                        </li>
                        <li class="nav-item"><a href="sidebar_components" class="nav-link">Sidebar components</a></li>
                    </ul>
                </li>
                <li class="nav-item nav-item-submenu">
                    <a href="#" class="nav-link">
                        <i class="ph-rows"></i>
                        <span>Navbars</span>
                    </a>
                    <ul class="nav-group-sub collapse">
                        <li class="nav-item nav-item-submenu">
                            <a href="#" class="nav-link">Single navbar</a>
                            <ul class="nav-group-sub collapse">
                                <li class="nav-item"><a href="navbar_single_bottom_fixed" class="nav-link">Bottom fixed</a></li>
                                <li class="nav-item"><a href="navbar_single_header_before" class="nav-link">Before page header</a></li>
                                <li class="nav-item"><a href="navbar_single_header_before_fixed" class="nav-link">Before page header fixed</a></li>
                                <li class="nav-item"><a href="navbar_single_header_after" class="nav-link">After page header</a></li>
                                <li class="nav-item"><a href="navbar_single_header_after_sticky" class="nav-link">After page header sticky</a></li>
                            </ul>
                        </li>
                        <li class="nav-item nav-item-submenu">
                            <a href="#" class="nav-link">Multiple navbars</a>
                            <ul class="nav-group-sub collapse">
                                <li class="nav-item"><a href="navbar_multiple_top_static" class="nav-link">Top static</a></li>
                                <li class="nav-item"><a href="navbar_multiple_top_fixed" class="nav-link">Top fixed</a></li>
                                <li class="nav-item"><a href="navbar_multiple_bottom_static" class="nav-link">Bottom static</a></li>
                                <li class="nav-item"><a href="navbar_multiple_bottom_fixed" class="nav-link">Multiple bottom fixed</a></li>
                                <li class="nav-item"><a href="navbar_multiple_top_bottom_fixed" class="nav-link">Top and bottom fixed</a></li>
                            </ul>
                        </li>
                        <li class="nav-item nav-item-submenu">
                            <a href="#" class="nav-link">Content navbar</a>
                            <ul class="nav-group-sub collapse">
                                <li class="nav-item"><a href="navbar_component_single" class="nav-link">Single navbar</a></li>
                                <li class="nav-item"><a href="navbar_component_multiple" class="nav-link">Multiple navbars</a></li>
                            </ul>
                        </li>
                        <li class="nav-item-divider"></li>
                        <li class="nav-item"><a href="navbar_colors" class="nav-link">Color options</a></li>
                        <li class="nav-item"><a href="navbar_sizes" class="nav-link">Sizing options</a></li>
                        <li class="nav-item"><a href="navbar_components" class="nav-link">Navbar components</a></li>
                    </ul>
                </li>
                <li class="nav-item nav-item-submenu">
                    <a href="#" class="nav-link">
                        <i class="ph-arrow-fat-lines-down"></i>
                        <span>Vertical navigation</span>
                    </a>
                    <ul class="nav-group-sub collapse">
                        <li class="nav-item"><a href="navigation_vertical_styles" class="nav-link">Navigation styles</a></li>
                        <li class="nav-item"><a href="navigation_vertical_collapsible" class="nav-link">Collapsible menu</a></li>
                        <li class="nav-item"><a href="navigation_vertical_accordion" class="nav-link">Accordion menu</a></li>
                        <li class="nav-item"><a href="navigation_vertical_bordered" class="nav-link">Bordered navigation</a></li>
                        <li class="nav-item"><a href="navigation_vertical_right_icons" class="nav-link">Right icons</a></li>
                        <li class="nav-item"><a href="navigation_vertical_badges" class="nav-link">Badges</a></li>
                        <li class="nav-item"><a href="navigation_vertical_disabled" class="nav-link">Disabled items</a></li>
                    </ul>
                </li>
                <li class="nav-item nav-item-submenu">
                    <a href="#" class="nav-link">
                        <i class="ph-arrow-fat-lines-right"></i>
                        <span>Horizontal navigation</span>
                    </a>
                    <ul class="nav-group-sub collapse">
                        <li class="nav-item"><a href="navigation_horizontal_styles" class="nav-link">Navigation styles</a></li>
                        <li class="nav-item"><a href="navigation_horizontal_elements" class="nav-link">Navigation elements</a></li>
                        <li class="nav-item"><a href="navigation_horizontal_tabs" class="nav-link">Tabbed navigation</a></li>
                        <li class="nav-item"><a href="navigation_horizontal_disabled" class="nav-link">Disabled navigation links</a></li>
                        <li class="nav-item"><a href="navigation_horizontal_mega" class="nav-link">Horizontal mega menu</a></li>
                    </ul>
                </li>
                <li class="nav-item nav-item-submenu">
                    <a href="#" class="nav-link"><i class="ph-arrow-elbow-down-right"></i> <span>Menu levels</span></a>
                    <ul class="nav-group-sub collapse">
                        <li class="nav-item"><a href="#" class="nav-link">Second level</a></li>
                        <li class="nav-item nav-item-submenu">
                            <a href="#" class="nav-link">Second level with child</a>
                            <ul class="nav-group-sub collapse">
                                <li class="nav-item"><a href="#" class="nav-link">Third level</a></li>
                                <li class="nav-item nav-item-submenu">
                                    <a href="#" class="nav-link">Third level with child</a>
                                    <ul class="nav-group-sub collapse">
                                        <li class="nav-item"><a href="#" class="nav-link">Fourth level</a></li>
                                        <li class="nav-item"><a href="#" class="nav-link">Fourth level</a></li>
                                    </ul>
                                </li>
                                <li class="nav-item"><a href="#" class="nav-link">Third level</a></li>
                            </ul>
                        </li>
                        <li class="nav-item"><a href="#" class="nav-link">Second level</a></li>
                    </ul>
                </li>
                <!-- /layout -->

            </ul>
        </div>
        <!-- /main navigation -->

    </div>
    <!-- /sidebar content -->


    <!-- Upgrade plan block -->
    <div class="alert bg-secondary bg-opacity-20 sidebar-resize-hide rounded p-3 m-3">
        <div class="d-flex mb-2">
            <div class="d-inline-flex bg-white bg-opacity-10 lh-1 rounded-pill p-2">
                <i class="ph-lock-key-open"></i>
            </div>
            <button type="button" class="btn-close btn-close-white ms-auto" data-bs-dismiss="alert"></button>
        </div>
        <div class="mb-2">
            Upgrade to <span class="fw-bold">Pro plan</span> to unlock all available features
        </div>
        <a href="#" class="d-inline-flex align-items-center mt-1" data-color-theme="dark">
            Upgrade now
            <i class="ph-arrow-circle-right ms-2"></i>
        </a>
    </div>
    <!-- /upgrade plan block -->

</div>
<!-- /main sidebar -->
