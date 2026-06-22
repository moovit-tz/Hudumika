<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
    <title>Limitless - Responsive Web Application Kit by Themesbrand</title>

    <!-- Global stylesheets -->
    <link href="{{URL::asset('assets/fonts/inter/inter.css')}}" rel="stylesheet" type="text/css">
    <link href="{{URL::asset('assets/icons/phosphor/styles.min.css')}}" rel="stylesheet" type="text/css">
    <link href="{{URL::asset('assets/css/all.min.css')}}" id="stylesheet" rel="stylesheet" type="text/css">
    <!-- /global stylesheets -->

    <!-- Core JS files -->
    <script src="{{URL::asset('assets/demo/demo_configurator.js')}}"></script>
    <script src="{{URL::asset('assets/js/bootstrap/bootstrap.bundle.min.js')}}"></script>
    <!-- /core JS files -->

    <!-- Theme JS files -->
    <script src="{{URL::asset('assets/js/vendor/visualization/echarts/echarts.min.js')}}"></script>
    <script src="{{URL::asset('assets/js/vendor/maps/echarts/world.js')}}"></script>

    <script src="{{URL::asset('assets/js/app.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard_6/area_gradient.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard_6/map_europe_effect.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard_6/progress_sortable.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard_6/bars_grouped.js')}}"></script>
    <script src="{{URL::asset('assets/demo/charts/pages/dashboard_6/line_label_marks.js')}}"></script>
    <!-- /theme JS files -->

</head>

<body>

    <!-- Main navbar -->
    <div class="navbar navbar-expand-xl navbar-static shadow">
        <div class="container px-sm-3">
            <div class="navbar-brand flex-1">
                <a href="index" class="d-inline-flex align-items-center">
                    <img src="{{URL::asset('assets/images/logo_icon.svg')}}" alt="">
                    <img src="{{URL::asset('assets/images/logo_text_dark.svg')}}" class="d-none d-sm-inline-block h-16px invert-dark ms-3" alt="">
                </a>
            </div>

            <div class="d-flex w-100 w-xl-auto overflow-auto overflow-xl-visible scrollbar-hidden border-top border-top-xl-0 order-1 order-xl-0 pt-2 pt-xl-0 mt-2 mt-xl-0">
                <ul class="nav gap-1 justify-content-center flex-nowrap flex-xl-wrap mx-auto">
                    <li class="nav-item">
                        <a href="index" class="navbar-nav-link rounded">
                            <i class="ph-house me-2"></i>
                            Home
                        </a>
                    </li>

                    <li class="nav-item nav-item-dropdown">
                        <a href="#" class="navbar-nav-link dropdown-toggle rounded" data-bs-toggle="dropdown" data-bs-auto-close="outside">
                            <i class="ph-rows me-2"></i>
                            Navigation
                        </a>

                        <div class="dropdown-menu p-0">
                            <div class="d-xl-flex">
                                <div class="d-flex flex-row flex-xl-column bg-light overflow-auto overflow-xl-visible rounded-top rounded-top-xl-0 rounded-start-xl">
                                    <div class="flex-1 border-bottom border-bottom-xl-0 p-2 p-xl-3">
                                        <div class="fw-bold border-bottom d-none d-xl-block pb-2 mb-2">Navigation</div>
                                        <ul class="nav nav-pills flex-xl-column flex-nowrap text-nowrap justify-content-center wmin-xl-300" role="tablist">
                                            <li class="nav-item" role="presentation">
                                                <a href="#tab_page" class="nav-link rounded" data-bs-toggle="tab" aria-selected="true" role="tab">
                                                    <i class="ph-layout me-2"></i>
                                                    Page
                                                    <i class="ph-arrow-right nav-item-active-indicator d-none d-xl-inline-block ms-auto"></i>
                                                </a>
                                            </li>
                                            <li class="nav-item" role="presentation">
                                                <a href="#tab_navbars" class="nav-link rounded" data-bs-toggle="tab" aria-selected="false" tabindex="-1" role="tab">
                                                    <i class="ph-rows me-2"></i>
                                                    Navbars
                                                    <i class="ph-arrow-right nav-item-active-indicator d-none d-xl-inline-block ms-auto"></i>
                                                </a>
                                            </li>
                                            <li class="nav-item" role="presentation">
                                                <a href="#tab_sidebar_types" class="nav-link rounded" data-bs-toggle="tab" aria-selected="false" tabindex="-1" role="tab">
                                                    <i class="ph-columns me-2"></i>
                                                    Sidebar types
                                                    <i class="ph-arrow-right nav-item-active-indicator d-none d-xl-inline-block ms-auto"></i>
                                                </a>
                                            </li>
                                            <li class="nav-item" role="presentation">
                                                <a href="#tab_sidebar_content" class="nav-link rounded" data-bs-toggle="tab" aria-selected="false" tabindex="-1" role="tab">
                                                    <i class="ph-sidebar-simple me-2"></i>
                                                    Sidebar content
                                                    <i class="ph-arrow-right nav-item-active-indicator d-none d-xl-inline-block ms-auto"></i>
                                                </a>
                                            </li>
                                            <li class="nav-item" role="presentation">
                                                <a href="#tab_navigation" class="nav-link rounded" data-bs-toggle="tab" aria-selected="false" tabindex="-1" role="tab">
                                                    <i class="ph-list-dashes me-2"></i>
                                                    Navigation
                                                    <i class="ph-arrow-right nav-item-active-indicator d-none d-xl-inline-block ms-auto"></i>
                                                </a>
                                            </li>
                                        </ul>
                                    </div>
                                </div>

                                <div class="tab-content flex-xl-1">
                                    <div class="tab-pane dropdown-scrollable-xl fade show p-3" id="tab_page" role="tabpanel">
                                        <div class="row">
                                            <div class="col-lg-4 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Sections</div>
                                                <a href="layout_no_header" class="dropdown-item rounded">No header</a>
                                                <a href="layout_no_footer" class="dropdown-item rounded">No footer</a>
                                                <a href="layout_fixed_header" class="dropdown-item rounded">Fixed header</a>
                                                <a href="layout_fixed_footer" class="dropdown-item rounded">Fixed footer</a>
                                            </div>

                                            <div class="col-lg-4 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Sidebars</div>
                                                <a href="layout_2_sidebars_1_side" class="dropdown-item rounded">2 sidebars on 1 side</a>
                                                <a href="layout_2_sidebars_2_sides" class="dropdown-item rounded">2 sidebars on 2 sides</a>
                                                <a href="layout_3_sidebars" class="dropdown-item rounded">3 sidebars</a>
                                            </div>

                                            <div class="col-lg-4">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Layout</div>
                                                <a href="layout_static" class="dropdown-item rounded">Static layout</a>
                                                <a href="layout_boxed_page" class="dropdown-item rounded">Boxed page</a>
                                                <a href="layout_liquid_content" class="dropdown-item rounded">Liquid content</a>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="tab-pane dropdown-scrollable-xl fade p-3" id="tab_navbars" role="tabpanel">
                                        <div class="row">
                                            <div class="col-lg-3 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Single</div>
                                                <a href="navbar_single_top_static" class="dropdown-item rounded">Top static</a>
                                                <a href="navbar_single_top_fixed" class="dropdown-item rounded">Top fixed</a>
                                                <a href="navbar_single_bottom_static" class="dropdown-item rounded">Bottom static</a>
                                                <a href="navbar_single_bottom_fixed" class="dropdown-item rounded">Bottom fixed</a>
                                            </div>

                                            <div class="col-lg-3 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Multiple</div>
                                                <a href="navbar_multiple_top_static" class="dropdown-item rounded">Top static</a>
                                                <a href="navbar_multiple_top_fixed" class="dropdown-item rounded">Top fixed</a>
                                                <a href="navbar_multiple_bottom_static" class="dropdown-item rounded">Bottom static</a>
                                                <a href="navbar_multiple_bottom_fixed" class="dropdown-item rounded">Bottom fixed</a>
                                                <a href="navbar_multiple_top_bottom_fixed" class="dropdown-item rounded">Top and bottom fixed</a>
                                            </div>

                                            <div class="col-lg-3 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Content</div>
                                                <a href="navbar_component_single" class="dropdown-item rounded">Single navbar</a>
                                                <a href="navbar_component_multiple" class="dropdown-item rounded">Multiple navbars</a>
                                            </div>

                                            <div class="col-lg-3">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Other</div>
                                                <a href="navbar_colors" class="dropdown-item rounded">Color options</a>
                                                <a href="navbar_sizes" class="dropdown-item rounded">Sizing options</a>
                                                <a href="navbar_components" class="dropdown-item rounded">Navbar components</a>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="tab-pane dropdown-scrollable-xl fade p-3" id="tab_sidebar_types" role="tabpanel">
                                        <div class="row">
                                            <div class="col-lg-3 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Main</div>
                                                <a href="sidebar_default_resizable" class="dropdown-item rounded">Resizable</a>
                                                <a href="sidebar_default_resized" class="dropdown-item rounded">Resized</a>
                                                <a href="sidebar_default_collapsible" class="dropdown-item rounded">Collapsible</a>
                                                <a href="sidebar_default_collapsed" class="dropdown-item rounded">Collapsed</a>
                                                <a href="sidebar_default_hideable" class="dropdown-item rounded">Hideable</a>
                                                <a href="sidebar_default_hidden" class="dropdown-item rounded">Hidden</a>
                                                <a href="sidebar_default_color_dark" class="dropdown-item rounded">Dark color</a>
                                            </div>

                                            <div class="col-lg-3 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Secondary</div>
                                                <a href="sidebar_secondary_collapsible" class="dropdown-item rounded">Collapsible</a>
                                                <a href="sidebar_secondary_collapsed" class="dropdown-item rounded">Collapsed</a>
                                                <a href="sidebar_secondary_hideable" class="dropdown-item rounded">Hideable</a>
                                                <a href="sidebar_secondary_hidden" class="dropdown-item rounded">Hidden</a>
                                                <a href="sidebar_secondary_color_dark" class="dropdown-item rounded">Dark color</a>
                                            </div>

                                            <div class="col-lg-3 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Right</div>
                                                <a href="sidebar_right_collapsible" class="dropdown-item rounded">Collapsible</a>
                                                <a href="sidebar_right_collapsed" class="dropdown-item rounded">Collapsed</a>
                                                <a href="sidebar_right_hideable" class="dropdown-item rounded">Hideable</a>
                                                <a href="sidebar_right_hidden" class="dropdown-item rounded">Hidden</a>
                                                <a href="sidebar_right_color_dark" class="dropdown-item rounded">Dark color</a>
                                            </div>

                                            <div class="col-lg-3">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Content</div>
                                                <a href="sidebar_content_left" class="dropdown-item rounded">Left aligned</a>
                                                <a href="sidebar_content_left_stretch" class="dropdown-item rounded">Left stretched</a>
                                                <a href="sidebar_content_left_sections" class="dropdown-item rounded">Left sectioned</a>
                                                <a href="sidebar_content_right" class="dropdown-item rounded">Right aligned</a>
                                                <a href="sidebar_content_right_stretch" class="dropdown-item rounded">Right stretched</a>
                                                <a href="sidebar_content_right_sections" class="dropdown-item rounded">Right sectioned</a>
                                                <a href="sidebar_content_color_dark" class="dropdown-item rounded">Dark color</a>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="tab-pane dropdown-scrollable-xl fade p-3" id="tab_sidebar_content" role="tabpanel">
                                        <div class="row">
                                            <div class="col-lg-6 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Sticky areas</div>
                                                <a href="sidebar_sticky_header" class="dropdown-item rounded">Header</a>
                                                <a href="sidebar_sticky_footer" class="dropdown-item rounded">Footer</a>
                                                <a href="sidebar_sticky_header_footer" class="dropdown-item rounded">Header and footer</a>
                                                <a href="sidebar_sticky_custom" class="dropdown-item rounded">Custom elements</a>
                                            </div>

                                            <div class="col-lg-6">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Other</div>
                                                <a href="sidebar_components" class="dropdown-item rounded">Sidebar components</a>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="tab-pane dropdown-scrollable-xl fade p-3" id="tab_navigation" role="tabpanel">
                                        <div class="row">
                                            <div class="col-lg-6 mb-3 mb-lg-0">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Vertical</div>
                                                <a href="navigation_vertical_styles" class="dropdown-item rounded">Navigation styles</a>
                                                <a href="navigation_vertical_collapsible" class="dropdown-item rounded">Collapsible menu</a>
                                                <a href="navigation_vertical_accordion" class="dropdown-item rounded">Accordion menu</a>
                                                <a href="navigation_vertical_bordered" class="dropdown-item rounded">Bordered navigation</a>
                                                <a href="navigation_vertical_right_icons" class="dropdown-item rounded">Right icons</a>
                                                <a href="navigation_vertical_badges" class="dropdown-item rounded">Badges</a>
                                                <a href="navigation_vertical_disabled" class="dropdown-item rounded">Disabled items</a>
                                            </div>

                                            <div class="col-lg-6">
                                                <div class="fw-bold border-bottom pb-2 mb-2">Horizontal</div>
                                                <a href="navigation_horizontal_styles" class="dropdown-item rounded">Navigation styles</a>
                                                <a href="navigation_horizontal_elements" class="dropdown-item rounded">Navigation elements</a>
                                                <a href="navigation_horizontal_tabs" class="dropdown-item rounded">Tabbed navigation</a>
                                                <a href="navigation_horizontal_disabled" class="dropdown-item rounded">Disabled items</a>
                                                <a href="navigation_horizontal_mega" class="dropdown-item rounded">Mega menu</a>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </li>

                    <li class="nav-item nav-item-dropdown-xl dropdown">
                        <a href="#" class="navbar-nav-link dropdown-toggle rounded" data-bs-toggle="dropdown">
                            <i class="ph-note-blank me-2"></i>
                            Starter kit
                        </a>

                        <div class="dropdown-menu">
                            <div class="dropdown-submenu dropdown-submenu-start">
                                <a href="#" class="dropdown-item dropdown-toggle">
                                    <i class="ph-columns me-2"></i>
                                    Sidebars
                                </a>
                                <div class="dropdown-menu">
                                    <a href="../seed/layout_2_sidebars_1_side" class="dropdown-item rounded">2 sidebars on 1 side</a>
                                    <a href="../seed/layout_2_sidebars_2_sides" class="dropdown-item rounded">2 sidebars on 2 sides</a>
                                    <a href="../seed/layout_3_sidebars" class="dropdown-item rounded">3 sidebars</a>
                                </div>
                            </div>
                            <div class="dropdown-submenu dropdown-submenu-start">
                                <a href="#" class="dropdown-item dropdown-toggle">
                                    <i class="ph-rows me-2"></i>
                                    Sections
                                </a>
                                <div class="dropdown-menu">
                                    <a href="../seed/layout_no_header" class="dropdown-item rounded">No header</a>
                                    <a href="../seed/layout_no_footer" class="dropdown-item rounded">No footer</a>
                                    <a href="../seed/layout_fixed_header" class="dropdown-item rounded">Fixed header</a>
                                    <a href="../seed/layout_fixed_footer" class="dropdown-item rounded">Fixed footer</a>
                                </div>
                            </div>
                            <div class="dropdown-divider"></div>
                            <a href="../seed/layout_static" class="dropdown-item rounded">Static layout</a>
                            <a href="../seed/layout_boxed_page" class="dropdown-item rounded">Boxed page</a>
                            <a href="../seed/layout_liquid_content" class="dropdown-item rounded">Liquid content</a>
                        </div>
                    </li>

                    <li class="nav-item nav-item-dropdown-xl dropdown">
                        <a href="#" class="navbar-nav-link dropdown-toggle rounded" data-bs-toggle="dropdown">
                            <i class="ph-arrows-clockwise me-2"></i>
                            Switch
                        </a>
                    </li>
                </ul>
            </div>

            <ul class="nav gap-1 flex-xl-1 justify-content-end order-0 order-xl-1">
                <li class="nav-item nav-item-dropdown-xl dropdown">
                    <a href="#" class="navbar-nav-link navbar-nav-link-icon rounded-pill" data-bs-toggle="dropdown">
                        <i class="ph-squares-four"></i>
                    </a>

                    <div class="dropdown-menu dropdown-menu-end dropdown-menu-scrollable-sm wmin-lg-600 p-0">
                        <div class="d-flex align-items-center border-bottom p-3">
                            <h6 class="mb-0">Browse apps</h6>
                            <a href="#" class="ms-auto">
                                View all
                                <i class="ph-arrow-circle-right ms-1"></i>
                            </a>
                        </div>

                        <div class="row row-cols-1 row-cols-sm-2 g-0">
                            <div class="col">
                                <button type="button" class="dropdown-item text-wrap h-100 align-items-start border-end-sm border-bottom p-3">
                                    <div>
                                        <img src="{{URL::asset('assets/images/demo/logos/1.svg')}}" class="h-40px mb-2" alt="">
                                        <div class="fw-semibold my-1">Customer data platform</div>
                                        <div class="text-muted">Unify customer data from multiple sources</div>
                                    </div>
                                </button>
                            </div>

                            <div class="col">
                                <button type="button" class="dropdown-item text-wrap h-100 align-items-start border-bottom p-3">
                                    <div>
                                        <img src="{{URL::asset('assets/images/demo/logos/2.svg')}}" class="h-40px mb-2" alt="">
                                        <div class="fw-semibold my-1">Data catalog</div>
                                        <div class="text-muted">Discover, inventory, and organize data assets</div>
                                    </div>
                                </button>
                            </div>

                            <div class="col">
                                <button type="button" class="dropdown-item text-wrap h-100 align-items-start border-end-sm border-bottom border-bottom-sm-0 rounded-bottom-start p-3">
                                    <div>
                                        <img src="{{URL::asset('assets/images/demo/logos/3.svg')}}" class="h-40px mb-2" alt="">
                                        <div class="fw-semibold my-1">Data governance</div>
                                        <div class="text-muted">The collaboration hub and data marketplace</div>
                                    </div>
                                </button>
                            </div>

                            <div class="col">
                                <button type="button" class="dropdown-item text-wrap h-100 align-items-start rounded-bottom-end p-3">
                                    <div>
                                        <img src="{{URL::asset('assets/images/demo/logos/4.svg')}}" class="h-40px mb-2" alt="">
                                        <div class="fw-semibold my-1">Data privacy</div>
                                        <div class="text-muted">Automated provisioning of non-production datasets</div>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                </li>

                <li class="nav-item">
                    <a href="#" class="navbar-nav-link navbar-nav-link-icon rounded-pill" data-bs-toggle="offcanvas" data-bs-target="#notifications">
                        <i class="ph-bell"></i>
                        <span class="badge bg-yellow text-black position-absolute top-0 end-0 translate-middle-top zindex-1 rounded-pill mt-1 me-1">2</span>
                    </a>
                </li>

                <li class="nav-item nav-item-dropdown-xl dropdown">
                    <a href="#" class="navbar-nav-link align-items-center rounded-pill p-1" data-bs-toggle="dropdown">
                        <div class="status-indicator-container">
                             <img src="@if (Auth::user()->avatar != ''){{ URL::asset('images/' . Auth::user()->avatar) }}@else{{ URL::asset('assets/images/users/avatar-1.jpg') }}@endif" class="w-32px h-32px rounded-pill" alt="">
                            <span class="status-indicator bg-success"></span>
                        </div>
                        <span class="d-none d-md-inline-block mx-md-2">{{Auth::user()->name}}</span>
                    </a>

                    <div class="dropdown-menu dropdown-menu-end">
                        <a href="#" class="dropdown-item">
                            <i class="ph-user-circle me-2"></i>
                            My profile
                        </a>
                        <a href="#" class="dropdown-item">
                            <i class="ph-currency-circle-dollar me-2"></i>
                            My subscription
                        </a>
                        <a href="#" class="dropdown-item">
                            <i class="ph-shopping-cart me-2"></i>
                            My orders
                        </a>
                        <a href="#" class="dropdown-item">
                            <i class="ph-envelope-open me-2"></i>
                            My inbox
                            <span class="badge bg-primary rounded-pill ms-auto">26</span>
                        </a>
                        <div class="dropdown-divider"></div>
                        <a href="#" class="dropdown-item">
                            <i class="ph-gear me-2"></i>
                            Account settings
                        </a>
                        <a class="dropdown-item" href="{{ route('logout') }}" onclick="event.preventDefault();
	                                                     document.getElementById('logout-form').submit();">
                            <i class="ph-sign-out me-2"></i> {{ __('Logout') }}
                        </a>

                        <form id="logout-form" action="{{ route('logout') }}" method="POST" class="d-none">
                            @csrf
                        </form>
                    </div>
                </li>
            </ul>
        </div>
    </div>
    <!-- /main navbar -->

    <!-- Page content -->
    <div class="page-content">

        <!-- Main content -->
        <div class="content-wrapper">

            <!-- Inner content -->
            <div class="content-inner">

                <!-- Page header -->
                <div class="page-header">
                    <div class="page-header-content container d-lg-flex">
                        <div class="d-flex">
                            <h4 class="page-title mb-0">
                                Home - <span class="fw-normal">Dashboard</span>
                            </h4>

                            <a href="#page_header" class="btn btn-light align-self-center collapsed d-lg-none border-transparent rounded-pill p-0 ms-auto" data-bs-toggle="collapse">
                                <i class="ph-caret-down collapsible-indicator ph-sm m-1"></i>
                            </a>
                        </div>

                        <div class="collapse d-lg-block my-lg-auto ms-lg-auto" id="page_header">
                            <div class="d-sm-flex align-items-center mb-3 mb-lg-0 ms-lg-3">
                                <div class="dropdown w-100 w-sm-auto">
                                    <a href="#" class="d-flex align-items-center text-body lh-1 dropdown-toggle py-sm-2" data-bs-toggle="dropdown" data-bs-display="static">
                                        <img src="{{URL::asset('assets/images/brands/tesla.svg')}}" class="w-32px h-32px me-2" alt="">
                                        <div class="me-auto me-lg-1">
                                            <div class="fs-sm text-muted mb-1">Customer</div>
                                            <div class="fw-semibold">Tesla Motors Inc</div>
                                        </div>
                                    </a>

                                    <div class="dropdown-menu dropdown-menu-lg-end w-100 w-lg-auto wmin-300 wmin-sm-350 pt-0">
                                        <div class="d-flex align-items-center p-3">
                                            <h6 class="fw-semibold mb-0">Customers</h6>
                                            <a href="#" class="ms-auto">
                                                View all
                                                <i class="ph-arrow-circle-right ms-1"></i>
                                            </a>
                                        </div>
                                        <a href="#" class="dropdown-item active py-2">
                                            <img src="{{URL::asset('assets/images/brands/tesla.svg')}}" class="w-32px h-32px me-2" alt="">
                                            <div>
                                                <div class="fw-semibold">Tesla Motors Inc</div>
                                                <div class="fs-sm text-muted">42 users</div>
                                            </div>
                                        </a>
                                        <a href="#" class="dropdown-item py-2">
                                            <img src="{{URL::asset('assets/images/brands/debijenkorf.svg')}}" class="w-32px h-32px me-2" alt="">
                                            <div>
                                                <div class="fw-semibold">De Bijenkorf</div>
                                                <div class="fs-sm text-muted">49 users</div>
                                            </div>
                                        </a>
                                        <a href="#" class="dropdown-item py-2">
                                            <img src="{{URL::asset('assets/images/brands/klm.svg')}}" class="w-32px h-32px me-2" alt="">
                                            <div>
                                                <div class="fw-semibold">Royal Dutch Airlines</div>
                                                <div class="fs-sm text-muted">18 users</div>
                                            </div>
                                        </a>
                                        <a href="#" class="dropdown-item py-2">
                                            <img src="{{URL::asset('assets/images/brands/shell.svg')}}" class="w-32px h-32px me-2" alt="">
                                            <div>
                                                <div class="fw-semibold">Royal Dutch Shell</div>
                                                <div class="fs-sm text-muted">54 users</div>
                                            </div>
                                        </a>
                                        <a href="#" class="dropdown-item py-2">
                                            <img src="{{URL::asset('assets/images/brands/bp.svg')}}" class="w-32px h-32px me-2" alt="">
                                            <div>
                                                <div class="fw-semibold">BP plc</div>
                                                <div class="fs-sm text-muted">23 users</div>
                                            </div>
                                        </a>
                                    </div>
                                </div>

                                <div class="vr d-none d-sm-block flex-shrink-0 my-2 mx-3"></div>

                                <div class="d-inline-flex mt-3 mt-sm-0">
                                    <a href="#" class="status-indicator-container ms-1">
                                        <img src="{{URL::asset('assets/images/demo/users/face24.jpg')}}" class="w-32px h-32px rounded-pill" alt="">
                                        <span class="status-indicator bg-warning"></span>
                                    </a>
                                    <a href="#" class="status-indicator-container ms-1">
                                        <img src="{{URL::asset('assets/images/demo/users/face1.jpg')}}" class="w-32px h-32px rounded-pill" alt="">
                                        <span class="status-indicator bg-success"></span>
                                    </a>
                                    <a href="#" class="status-indicator-container ms-1">
                                        <img src="{{URL::asset('assets/images/demo/users/face3.jpg')}}" class="w-32px h-32px rounded-pill" alt="">
                                        <span class="status-indicator bg-danger"></span>
                                    </a>
                                    <a href="#" class="btn btn-outline-primary btn-icon w-32px h-32px rounded-pill ms-3">
                                        <i class="ph-plus"></i>
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- /page header -->

                <!-- Content area -->
                <div class="content container pt-0">

                    <!-- Blocks with chart -->
                    <div class="row">
                        <div class="col-lg-4">
                            <div class="card">
                                <div class="card-header d-flex border-bottom-0 pb-1 mb-0">
                                    <div>
                                        <span class="fw-medium mb-1">Total visitors</span>
                                        <h2 class="fw-bold mb-0">5,274 <small class="text-success fs-base fw-normal ms-2">+ 3.6%</small></h2>
                                    </div>

                                    <div class="dropdown ms-auto">
                                        <button type="button" data-bs-toggle="dropdown" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill">
                                            <i class="ph-dots-three-vertical"></i>
                                        </button>

                                        <div class="dropdown-menu dropdown-menu-end">
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-eye me-2"></i>
                                                View report
                                            </a>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-printer me-2"></i>
                                                Print report
                                            </a>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-file-pdf me-2"></i>
                                                Export report
                                            </a>
                                            <div class="dropdown-divider"></div>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-gear me-2"></i>
                                                Configure
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                <div class="chart-container">
                                    <div class="chart" id="area_gradient_blue" style="height: 100px"></div>
                                </div>
                            </div>
                        </div>

                        <div class="col-lg-4">
                            <div class="card">
                                <div class="card-header d-flex border-bottom-0 pb-1 mb-0">
                                    <div>
                                        <span class="fw-medium mb-1">New opportunities</span>
                                        <h2 class="fw-bold mb-0">2,785 <small class="text-success fs-base fw-normal ms-2">+ 5.9%</small></h2>
                                    </div>

                                    <div class="dropdown ms-auto">
                                        <button type="button" data-bs-toggle="dropdown" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill">
                                            <i class="ph-dots-three-vertical"></i>
                                        </button>

                                        <div class="dropdown-menu dropdown-menu-end">
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-eye me-2"></i>
                                                View report
                                            </a>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-printer me-2"></i>
                                                Print report
                                            </a>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-file-pdf me-2"></i>
                                                Export report
                                            </a>
                                            <div class="dropdown-divider"></div>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-gear me-2"></i>
                                                Configure
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                <div class="chart-container">
                                    <div class="chart" id="area_gradient_orange" style="height: 100px"></div>
                                </div>
                            </div>
                        </div>

                        <div class="col-lg-4">
                            <div class="card">
                                <div class="card-header d-flex border-bottom-0 pb-1 mb-0">
                                    <div>
                                        <span class="fw-medium mb-1">New leads</span>
                                        <h2 class="fw-bold mb-0">1,589 <small class="text-danger fs-base fw-normal ms-2">- 1.8%</small></h2>
                                    </div>

                                    <div class="dropdown ms-auto">
                                        <button type="button" data-bs-toggle="dropdown" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill">
                                            <i class="ph-dots-three-vertical"></i>
                                        </button>

                                        <div class="dropdown-menu dropdown-menu-end">
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-eye me-2"></i>
                                                View report
                                            </a>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-printer me-2"></i>
                                                Print report
                                            </a>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-file-pdf me-2"></i>
                                                Export report
                                            </a>
                                            <div class="dropdown-divider"></div>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-gear me-2"></i>
                                                Configure
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                <div class="chart-container">
                                    <div class="chart" id="area_gradient_green" style="height: 100px"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- /blocks with chart -->


                    <!-- Sales by country -->
                    <div class="card">
                        <div class="card-header">
                            <h5 class="mb-0">Daily sales by country</h5>
                        </div>

                        <div class="card-body">
                            <div class="row">
                                <div class="col-xl-6">
                                    <div class="map-container map-echarts overflow-hidden rounded mb-3 mb-xl-0" id="map_europe_effect" style="height: 400px;"></div>
                                </div>

                                <div class="col-xl-6">
                                    <div class="d-sm-flex justify-content-sm-around">
                                        <div class="d-flex align-items-center justify-content-sm-center mb-3">
                                            <span class="bg-pink bg-opacity-10 text-pink lh-1 rounded p-2 me-3">
                                                <i class="ph-shopping-cart"></i>
                                            </span>
                                            <div>
                                                <h6 class="fw-bold mb-0">1,890</h6>
                                                <span class="text-muted">Total sales</span>
                                            </div>
                                        </div>

                                        <div class="d-flex align-items-center justify-content-sm-center mb-3">
                                            <span class="bg-teal bg-opacity-10 text-teal lh-1 rounded p-2 me-3">
                                                <i class="ph-currency-eur"></i>
                                            </span>
                                            <div>
                                                <h6 class="fw-bold mb-0">€11,781</h6>
                                                <span class="text-muted">Total revenue</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="chart-container">
                                        <div class="chart" id="progress_bar_sorted" style="height: 333px;"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- /sales by country -->


                    <!-- Latest orders -->
                    <div class="card">
                        <div class="card-header d-flex py-0">
                            <h5 class="py-3 mb-0">Latest orders</h5>

                            <div class="d-inline-flex align-items-center ms-auto">
                                <span class="badge bg-success fw-semibold">29 new</span>
                                <div class="dropdown ms-2">
                                    <button type="button" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill" data-bs-toggle="dropdown">
                                        <i class="ph-dots-three-vertical"></i>
                                    </button>

                                    <div class="dropdown-menu dropdown-menu-end">
                                        <a href="#" class="dropdown-item">
                                            <i class="ph-eye me-2"></i>
                                            View report
                                        </a>
                                        <a href="#" class="dropdown-item">
                                            <i class="ph-printer me-2"></i>
                                            Print report
                                        </a>
                                        <a href="#" class="dropdown-item">
                                            <i class="ph-file-pdf me-2"></i>
                                            Export report
                                        </a>
                                        <div class="dropdown-divider"></div>
                                        <a href="#" class="dropdown-item">
                                            <i class="ph-gear me-2"></i>
                                            Configure
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="table-responsive">
                            <table class="table text-nowrap">
                                <thead>
                                    <tr>
                                        <th>Company</th>
                                        <th>Delivery date</th>
                                        <th>Delivery method</th>
                                        <th>Status</th>
                                        <th class="text-center" style="width: 20px;"><i class="ph-arrow-circle-down"></i></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <a href="#" class="me-3">
                                                    <img src="{{URL::asset('assets/images/brands/klm.svg')}}" class="rounded-circle" width="32" height="32" alt="">
                                                </a>

                                                <div>
                                                    <a href="#" class="text-body fw-semibold">KLM Royal Dutch Airlines</a>
                                                    <div class="text-muted fs-sm">May 21st</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>June 12th</td>
                                        <td><img src="{{URL::asset('assets/images/brands/ups.svg')}}" class="me-1" width="20" alt=""> UPS Express</td>
                                        <td><span class="badge bg-success bg-opacity-10 text-success">Delivered</span></td>
                                        <td class="text-center">
                                            <div class="dropdown">
                                                <button type="button" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill" data-bs-toggle="dropdown">
                                                    <i class="ph-dots-three-vertical"></i>
                                                </button>
                                                <div class="dropdown-menu dropdown-menu-end">
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-receipt me-2"></i>
                                                        Order details
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-file-pdf me-2"></i>
                                                        Download invoice
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-chart-bar me-2"></i>
                                                        Statistics
                                                    </a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <a href="#" class="me-3">
                                                    <img src="{{URL::asset('assets/images/brands/amazon.svg')}}" class="rounded-circle" width="32" height="32" alt="">
                                                </a>

                                                <div>
                                                    <a href="#" class="text-body fw-semibold">Amazon Inc.</a>
                                                    <div class="text-muted fs-sm">May 22nd</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>June 13th</td>
                                        <td><img src="{{URL::asset('assets/images/brands/deutsche-post.svg')}}" class="rounded-sm me-1" width="20" alt=""> Deutsche post</td>
                                        <td><span class="badge bg-danger bg-opacity-10 text-danger">Delayed</span></td>
                                        <td class="text-center">
                                            <div class="dropdown">
                                                <button type="button" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill" data-bs-toggle="dropdown">
                                                    <i class="ph-dots-three-vertical"></i>
                                                </button>
                                                <div class="dropdown-menu dropdown-menu-end">
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-receipt me-2"></i>
                                                        Order details
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-file-pdf me-2"></i>
                                                        Download invoice
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-chart-bar me-2"></i>
                                                        Statistics
                                                    </a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <a href="#" class="me-3">
                                                    <img src="{{URL::asset('assets/images/brands/honda.svg')}}" class="rounded-circle" width="32" height="32" alt="">
                                                </a>

                                                <div>
                                                    <a href="#" class="text-body fw-semibold">Honda Motor Company</a>
                                                    <div class="text-muted fs-sm">May 22nd</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>June 14th</td>
                                        <td><img src="{{URL::asset('assets/images/brands/postnl.svg')}}" class="me-1" width="20" alt=""> PostNL</td>
                                        <td><span class="badge bg-secondary bg-opacity-10 text-secondary">Processing</span></td>
                                        <td class="text-center">
                                            <div class="dropdown">
                                                <button type="button" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill" data-bs-toggle="dropdown">
                                                    <i class="ph-dots-three-vertical"></i>
                                                </button>
                                                <div class="dropdown-menu dropdown-menu-end">
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-receipt me-2"></i>
                                                        Order details
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-file-pdf me-2"></i>
                                                        Download invoice
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-chart-bar me-2"></i>
                                                        Statistics
                                                    </a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <a href="#" class="me-3">
                                                    <img src="{{URL::asset('assets/images/brands/holiday-inn.svg')}}" class="rounded-circle" width="32" height="32" alt="">
                                                </a>

                                                <div>
                                                    <a href="#" class="text-body fw-semibold">Holiday Inn Hotels</a>
                                                    <div class="text-muted fs-sm">May 23rd</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>June 15th</td>
                                        <td><img src="{{URL::asset('assets/images/brands/fedex.svg')}}" class="rounded-sm me-1" width="20" alt=""> Fedex Express</td>
                                        <td><span class="badge bg-success bg-opacity-10 text-success">Delivered</span></td>
                                        <td class="text-center">
                                            <div class="dropdown">
                                                <button type="button" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill" data-bs-toggle="dropdown">
                                                    <i class="ph-dots-three-vertical"></i>
                                                </button>
                                                <div class="dropdown-menu dropdown-menu-end">
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-receipt me-2"></i>
                                                        Order details
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-file-pdf me-2"></i>
                                                        Download invoice
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-chart-bar me-2"></i>
                                                        Statistics
                                                    </a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <a href="#" class="me-3">
                                                    <img src="{{URL::asset('assets/images/brands/apple.svg')}}" class="rounded-circle" width="32" height="32" alt="">
                                                </a>

                                                <div>
                                                    <a href="#" class="text-body fw-semibold">Apple Inc.</a>
                                                    <div class="text-muted fs-sm">May 23rd</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>June 16th</td>
                                        <td><img src="{{URL::asset('assets/images/brands/deutsche-post.svg')}}" class="rounded-sm me-1" width="20" alt=""> Deutsche post</td>
                                        <td><span class="badge bg-indigo bg-opacity-10 text-indigo">Dispatched</span></td>
                                        <td class="text-center">
                                            <div class="dropdown">
                                                <button type="button" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill" data-bs-toggle="dropdown">
                                                    <i class="ph-dots-three-vertical"></i>
                                                </button>
                                                <div class="dropdown-menu dropdown-menu-end">
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-receipt me-2"></i>
                                                        Order details
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-file-pdf me-2"></i>
                                                        Download invoice
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-chart-bar me-2"></i>
                                                        Statistics
                                                    </a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <a href="#" class="me-3">
                                                    <img src="{{URL::asset('assets/images/brands/debijenkorf.svg')}}" class="rounded-circle" width="32" height="32" alt="">
                                                </a>

                                                <div>
                                                    <a href="#" class="text-body fw-semibold">de Bijenkorf</a>
                                                    <div class="text-muted fs-sm">May 23rd</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>June 17th</td>
                                        <td><img src="{{URL::asset('assets/images/brands/tnt.svg')}}" class="rounded-sm me-1" width="20" alt=""> TNT</td>
                                        <td><span class="badge bg-indigo bg-opacity-10 text-indigo">Dispatched</span></td>
                                        <td class="text-center">
                                            <div class="dropdown">
                                                <button type="button" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill" data-bs-toggle="dropdown">
                                                    <i class="ph-dots-three-vertical"></i>
                                                </button>
                                                <div class="dropdown-menu dropdown-menu-end">
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-receipt me-2"></i>
                                                        Order details
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-file-pdf me-2"></i>
                                                        Download invoice
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-chart-bar me-2"></i>
                                                        Statistics
                                                    </a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <a href="#" class="me-3">
                                                    <img src="{{URL::asset('assets/images/brands/texaco.svg')}}" class="rounded-circle" width="32" height="32" alt="">
                                                </a>

                                                <div>
                                                    <a href="#" class="text-body fw-semibold">Texaco Inc.</a>
                                                    <div class="text-muted fs-sm">May 24th</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>June 18th</td>
                                        <td><img src="{{URL::asset('assets/images/brands/dpd.svg')}}" class="me-1" width="20" alt=""> DPD</td>
                                        <td><span class="badge bg-danger bg-opacity-10 text-danger">Delayed</span></td>
                                        <td class="text-center">
                                            <div class="dropdown">
                                                <button type="button" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill" data-bs-toggle="dropdown">
                                                    <i class="ph-dots-three-vertical"></i>
                                                </button>
                                                <div class="dropdown-menu dropdown-menu-end">
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-receipt me-2"></i>
                                                        Order details
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-file-pdf me-2"></i>
                                                        Download invoice
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-chart-bar me-2"></i>
                                                        Statistics
                                                    </a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <a href="#" class="me-3">
                                                    <img src="{{URL::asset('assets/images/brands/shell.svg')}}" class="rounded-circle" width="32" height="32" alt="">
                                                </a>

                                                <div>
                                                    <a href="#" class="text-body fw-semibold">Royal Dutch Shell</a>
                                                    <div class="text-muted fs-sm">May 25th</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>June 19th</td>
                                        <td><img src="{{URL::asset('assets/images/brands/ups.svg')}}" class="me-1" width="20" alt=""> UPS Express</td>
                                        <td><span class="badge bg-success bg-opacity-10 text-success">Delivered</span></td>
                                        <td class="text-center">
                                            <div class="dropdown">
                                                <button type="button" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill" data-bs-toggle="dropdown">
                                                    <i class="ph-dots-three-vertical"></i>
                                                </button>
                                                <div class="dropdown-menu dropdown-menu-end">
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-receipt me-2"></i>
                                                        Order details
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-file-pdf me-2"></i>
                                                        Download invoice
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-chart-bar me-2"></i>
                                                        Statistics
                                                    </a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <a href="#" class="me-3">
                                                    <img src="{{URL::asset('assets/images/brands/tesla.svg')}}" class="rounded-circle" width="32" height="32" alt="">
                                                </a>

                                                <div>
                                                    <a href="#" class="text-body fw-semibold">Tesla Inc.</a>
                                                    <div class="text-muted fs-sm">May 26th</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>June 21st</td>
                                        <td><img src="{{URL::asset('assets/images/brands/dpd.svg')}}" class="me-1" width="20" alt=""> DPD</td>
                                        <td><span class="badge bg-secondary bg-opacity-10 text-secondary">Processing</span></td>
                                        <td class="text-center">
                                            <div class="dropdown">
                                                <button type="button" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill" data-bs-toggle="dropdown">
                                                    <i class="ph-dots-three-vertical"></i>
                                                </button>
                                                <div class="dropdown-menu dropdown-menu-end">
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-receipt me-2"></i>
                                                        Order details
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-file-pdf me-2"></i>
                                                        Download invoice
                                                    </a>
                                                    <a href="#" class="dropdown-item">
                                                        <i class="ph-chart-bar me-2"></i>
                                                        Statistics
                                                    </a>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <!-- /latest orders -->


                    <!-- Reports -->
                    <div class="row">
                        <div class="col-xl-6">

                            <!-- Annual sales report -->
                            <div class="card">
                                <div class="card-header d-flex py-0">
                                    <h6 class="py-3 mb-0">Annual sales report</h6>

                                    <div class="dropdown align-self-center ms-auto">
                                        <button type="button" data-bs-toggle="dropdown" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill">
                                            <i class="ph-dots-three-vertical"></i>
                                        </button>

                                        <div class="dropdown-menu dropdown-menu-end">
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-eye me-2"></i>
                                                View report
                                            </a>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-printer me-2"></i>
                                                Print report
                                            </a>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-file-pdf me-2"></i>
                                                Export report
                                            </a>
                                            <div class="dropdown-divider"></div>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-gear me-2"></i>
                                                Configure
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                <div class="card-body">
                                    <div class="d-sm-flex justify-content-sm-around">
                                        <div class="d-flex align-items-center justify-content-sm-center mb-3">
                                            <span class="bg-primary bg-opacity-10 text-primary lh-1 rounded p-2 me-3">
                                                <i class="ph-stack"></i>
                                            </span>
                                            <div>
                                                <h6 class="mb-0">4,485</h6>
                                                <span class="text-muted">Campaigns</span>
                                            </div>
                                        </div>

                                        <div class="d-flex align-items-center justify-content-sm-center mb-3">
                                            <span class="bg-success bg-opacity-10 text-success lh-1 rounded p-2 me-3">
                                                <i class="ph-user-switch"></i>
                                            </span>
                                            <div>
                                                <h6 class="mb-0">1,255</h6>
                                                <span class="text-muted">Leads</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="chart-container">
                                        <div class="chart" id="bars_grouped" style="height: 333px;"></div>
                                    </div>
                                </div>

                                <div class="table-responsive">
                                    <table class="table">
                                        <thead>
                                            <tr>
                                                <th>Campaign</th>
                                                <th>Leads</th>
                                                <th>Rate</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        April campaign
                                                        <a href="#" class="text-muted ms-auto"><i class="ph-arrow-square-out"></i></a>
                                                    </div>
                                                </td>
                                                <td>4,890</td>
                                                <td>
                                                    <div class="hstack gap-2 text-success">
                                                        <i class="ph-trend-up"></i>
                                                        0.25%
                                                    </div>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        Flash sale
                                                        <a href="#" class="text-muted ms-auto"><i class="ph-arrow-square-out"></i></a>
                                                    </div>
                                                </td>
                                                <td>1,896</td>
                                                <td>
                                                    <div class="hstack gap-2 text-danger">
                                                        <i class="ph-trend-down"></i>
                                                        1.2%
                                                    </div>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        Up to 40% off
                                                        <a href="#" class="text-muted ms-auto"><i class="ph-arrow-square-out"></i></a>
                                                    </div>
                                                </td>
                                                <td>2,880</td>
                                                <td>
                                                    <div class="hstack gap-2 text-danger">
                                                        <i class="ph-trend-down"></i>
                                                        0.59%
                                                    </div>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        Extended trial version
                                                        <a href="#" class="text-muted ms-auto"><i class="ph-arrow-square-out"></i></a>
                                                    </div>
                                                </td>
                                                <td>982</td>
                                                <td>
                                                    <div class="hstack gap-2 text-success">
                                                        <i class="ph-trend-up"></i>
                                                        1.05%
                                                    </div>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        50% off second license
                                                        <a href="#" class="text-muted ms-auto"><i class="ph-arrow-square-out"></i></a>
                                                    </div>
                                                </td>
                                                <td>3,780</td>
                                                <td>
                                                    <div class="hstack gap-2 text-success">
                                                        <i class="ph-trend-up"></i>
                                                        0.58%
                                                    </div>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        50% off second license
                                                        <a href="#" class="text-muted ms-auto"><i class="ph-arrow-square-out"></i></a>
                                                    </div>
                                                </td>
                                                <td>4,551</td>
                                                <td>
                                                    <div class="hstack gap-2 text-danger">
                                                        <i class="ph-trend-down"></i>
                                                        1.04%
                                                    </div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <!-- /annual sales report -->

                        </div>

                        <div class="col-xl-6">

                            <!-- Daily visitors report -->
                            <div class="card">
                                <div class="card-header d-flex py-0">
                                    <h6 class="py-3 mb-0">Daily visitors report</h6>

                                    <div class="dropdown align-self-center ms-auto">
                                        <button type="button" data-bs-toggle="dropdown" class="btn btn-outline-light btn-icon btn-sm text-body border-transparent rounded-pill">
                                            <i class="ph-dots-three-vertical"></i>
                                        </button>

                                        <div class="dropdown-menu dropdown-menu-end">
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-eye me-2"></i>
                                                View report
                                            </a>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-printer me-2"></i>
                                                Print report
                                            </a>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-file-pdf me-2"></i>
                                                Export report
                                            </a>
                                            <div class="dropdown-divider"></div>
                                            <a href="#" class="dropdown-item">
                                                <i class="ph-gear me-2"></i>
                                                Configure
                                            </a>
                                        </div>
                                    </div>
                                </div>

                                <div class="card-body">
                                    <div class="d-sm-flex justify-content-sm-around">
                                        <div class="d-flex align-items-center justify-content-sm-center mb-3">
                                            <span class="bg-indigo bg-opacity-10 text-indigo lh-1 rounded p-2 me-3">
                                                <i class="ph-user-circle-plus"></i>
                                            </span>
                                            <div>
                                                <h6 class="mb-0">4,782</h6>
                                                <span class="text-muted">New users</span>
                                            </div>
                                        </div>

                                        <div class="d-flex align-items-center justify-content-sm-center mb-3">
                                            <span class="bg-indigo bg-opacity-10 text-indigo lh-1 rounded p-2 me-3">
                                                <i class="ph-user-switch"></i>
                                            </span>
                                            <div>
                                                <h6 class="mb-0">6,478</h6>
                                                <span class="text-muted">Returned</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="chart-container">
                                        <div class="chart" id="line_label_marks" style="height: 333px;"></div>
                                    </div>
                                </div>

                                <div class="table-responsive">
                                    <table class="table">
                                        <thead>
                                            <tr>
                                                <th>Browser</th>
                                                <th>Diff</th>
                                                <th>Count</th>
                                                <th>Share</th>

                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        <img src="{{URL::asset('assets/images/browsers/chrome.svg')}}" class="me-2" alt="" style="height: 32px;">
                                                        Chrome
                                                    </div>
                                                </td>
                                                <td>
                                                    <div class="hstack gap-2 text-success">
                                                        <i class="ph-trend-up"></i>
                                                        4.84%
                                                    </div>
                                                </td>
                                                <td>728</td>
                                                <td>34.6%</td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        <img src="{{URL::asset('assets/images/browsers/firefox.svg')}}" class="me-2" alt="" style="height: 32px;">
                                                        Firefox
                                                    </div>
                                                </td>
                                                <td>
                                                    <div class="hstack gap-2 text-danger">
                                                        <i class="ph-trend-down"></i>
                                                        0.89%
                                                    </div>
                                                </td>
                                                <td>550</td>
                                                <td>20.4%</td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        <img src="{{URL::asset('assets/images/browsers/edge.svg')}}" class="me-2" alt="" style="height: 32px;">
                                                        Edge
                                                    </div>
                                                </td>
                                                <td>
                                                    <div class="hstack gap-2 text-success">
                                                        <i class="ph-trend-up"></i>
                                                        2.86%
                                                    </div>
                                                </td>
                                                <td>458</td>
                                                <td>15.5%</td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        <img src="{{URL::asset('assets/images/browsers/safari.svg')}}" class="me-2" alt="" style="height: 32px;">
                                                        Safari
                                                    </div>
                                                </td>
                                                <td>
                                                    <div class="hstack gap-2 text-success">
                                                        <i class="ph-trend-up"></i>
                                                        1.5%
                                                    </div>
                                                </td>
                                                <td>690</td>
                                                <td>12.5%</td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <div class="d-flex align-items-center">
                                                        <img src="{{URL::asset('assets/images/browsers/opera.svg')}}" class="me-2" alt="" style="height: 32px;">
                                                        Opera
                                                    </div>
                                                </td>
                                                <td>
                                                    <div class="hstack gap-2 text-danger">
                                                        <i class="ph-trend-down"></i>
                                                        2.45%
                                                    </div>
                                                </td>
                                                <td>886</td>
                                                <td>10.2%</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <!-- /daily visitors report -->

                        </div>
                    </div>
                    <!-- /reports -->

                </div>
                <!-- /content area -->

                @include('layouts.footer')

            </div>
            <!-- /inner content -->

        </div>
        <!-- /main content -->

    </div>
    <!-- /page content -->


    @include('layouts.notification')

    @include('layouts.right-sidebar')

</body>
</html>
