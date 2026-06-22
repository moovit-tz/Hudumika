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
    <script src="{{URL::asset('assets/js/vendor/ui/prism.min.js')}}"></script>

    <script src="{{URL::asset('assets/js/app.js')}}"></script>
    <!-- /theme JS files -->

</head>

<body>

     <!-- Main navbar -->
    <div class="navbar navbar-dark navbar-expand-lg navbar-static px-lg-0" id="navigation-menu">
        <div class="container-fluid container-boxed jusitfy-content-start">
            <div class="navbar-brand flex-1 flex-lg-0">
                <a href="index" class="d-inline-flex align-items-center">
                    <img src="{{URL::asset('assets/images/logo_icon.svg')}}" alt="">
                    <img src="{{URL::asset('assets/images/logo_text_light.svg')}}" class="d-none d-sm-inline-block h-16px ms-3" alt="">
                </a>
            </div>

            <ul class="nav order-2 order-lg-1 ms-2 ms-lg-3 me-lg-auto">
                <li class="nav-item">
                    <a href="#" class="navbar-nav-link navbar-nav-link-icon rounded-pill">
                        <div class="hstack gap-2 mx-lg-1">
                            <i class="ph-house"></i>
                            <span class="d-none d-lg-inline-block">Home</span>
                        </div>
                    </a>
                </li>

                <li class="nav-item">
                    <a href="#" class="navbar-nav-link navbar-nav-link-icon rounded-pill" data-bs-toggle="dropdown" data-bs-auto-close="outside">
                        <div class="hstack gap-2 mx-lg-1">
                            <i class="ph-rows"></i>
                            <span class="d-none d-lg-inline-block">Navigation</span>
                        </div>
                    </a>

                    <div class="dropdown-menu dropdown-mega-menu p-0">
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
                                            <a href="#tab_navbars" class="nav-link rounded active" data-bs-toggle="tab" aria-selected="false" tabindex="-1" role="tab">
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
                                <div class="tab-pane dropdown-scrollable-xl fade p-3" id="tab_page" role="tabpanel">
                                    <div class="row">
                                        <div class="col-lg-4 mb-3 mb-lg-0">
                                            <div class="fw-bold border-bottom pb-2 mb-2">Navbars</div>
                                            <a href="layout_navbar_fixed" class="dropdown-item rounded">Fixed navbar</a>
                                            <a href="layout_navbar_hideable" class="dropdown-item rounded">Hideable navbar</a>
                                            <a href="layout_navbar_sticky" class="dropdown-item rounded">Sticky navbar</a>
                                            <a href="layout_fixed_footer" class="dropdown-item rounded">Fixed footer</a>
                                        </div>

                                        <div class="col-lg-4 mb-3 mb-lg-0">
                                            <div class="fw-bold border-bottom pb-2 mb-2">Sidebars</div>
                                            <a href="layout_2_sidebars_1_side" class="dropdown-item rounded">2 sidebars on 1 side</a>
                                            <a href="layout_2_sidebars_2_sides" class="dropdown-item rounded">2 sidebars on 2 sides</a>
                                            <a href="layout_3_sidebars" class="dropdown-item rounded">3 sidebars</a>
                                        </div>

                                        <div class="col-lg-4">
                                            <div class="fw-bold border-bottom pb-2 mb-2">Sections</div>
                                            <a href="layout_no_header" class="dropdown-item rounded">No header</a>
                                            <a href="layout_no_footer" class="dropdown-item rounded">No footer</a>
                                            <a href="layout_boxed_page" class="dropdown-item rounded">Boxed page</a>
                                            <a href="layout_boxed_content" class="dropdown-item rounded">Boxed content</a>
                                        </div>
                                    </div>
                                </div>

                                <div class="tab-pane dropdown-scrollable-xl fade show active p-3" id="tab_navbars" role="tabpanel">
                                    <div class="row">
                                        <div class="col-lg-3 mb-3 mb-lg-0">
                                            <div class="fw-bold border-bottom pb-2 mb-2">Single</div>
                                            <a href="navbar_single_top_static" class="dropdown-item rounded">Top static</a>
                                            <a href="navbar_single_top_fixed" class="dropdown-item rounded active">Top fixed</a>
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
                                            <a href="navbar_multiple_secondary_sticky" class="dropdown-item rounded">Secondary sticky</a>
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
                                            <a href="sidebar_default_hideable" class="dropdown-item rounded">Hideable</a>
                                            <a href="sidebar_default_hidden" class="dropdown-item rounded">Hidden</a>
                                            <a href="sidebar_default_stretched" class="dropdown-item rounded">Stretched</a>
                                            <a href="sidebar_default_color_dark" class="dropdown-item rounded">Dark color</a>
                                        </div>

                                        <div class="col-lg-3 mb-3 mb-lg-0">
                                            <div class="fw-bold border-bottom pb-2 mb-2">Secondary</div>
                                            <a href="sidebar_secondary_hideable" class="dropdown-item rounded">Hideable</a>
                                            <a href="sidebar_secondary_hidden" class="dropdown-item rounded">Hidden</a>
                                            <a href="sidebar_secondary_stretched" class="dropdown-item rounded">Stretched</a>
                                            <a href="sidebar_secondary_color_dark" class="dropdown-item rounded">Dark color</a>
                                        </div>

                                        <div class="col-lg-3 mb-3 mb-lg-0">
                                            <div class="fw-bold border-bottom pb-2 mb-2">Right</div>
                                            <a href="sidebar_right_hideable" class="dropdown-item rounded">Hideable</a>
                                            <a href="sidebar_right_hidden" class="dropdown-item rounded">Hidden</a>
                                            <a href="sidebar_right_stretched" class="dropdown-item rounded">Stretched</a>
                                            <a href="sidebar_right_color_dark" class="dropdown-item rounded">Dark color</a>
                                        </div>

                                        <div class="col-lg-3">
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
            </ul>

            <button type="button" class="btn btn-outline-yellow btn-icon order-1 order-lg-2">
                <i class="ph-circles-three-plus ms-lg-1"></i>
                <span class="d-none d-lg-inline-block ms-2 me-1">Create project</span>
            </button>

            <ul class="nav order-3 ms-lg-2">
                <li class="nav-item ms-lg-2">
                    <a href="#" class="navbar-nav-link navbar-nav-link-icon rounded-pill" data-bs-toggle="offcanvas" data-bs-target="#notifications">
                        <i class="ph-bell"></i>
                        <span class="badge bg-yellow text-black position-absolute top-0 end-0 translate-middle-top zindex-1 rounded-pill mt-1 me-1">2</span>
                    </a>
                </li>

                <li class="nav-item nav-item-dropdown-lg dropdown ms-lg-2">
                    <a href="#" class="navbar-nav-link align-items-center rounded-pill p-1" data-bs-toggle="dropdown">
                        <div class="status-indicator-container">
                            <img src="@if (Auth::user()->avatar != ''){{ URL::asset('images/' . Auth::user()->avatar) }}@else{{ URL::asset('assets/images/users/avatar-1.jpg') }}@endif" class="w-32px h-32px rounded-pill" alt="">
                            <span class="status-indicator bg-success"></span>
                        </div>
                        <span class="d-none d-lg-inline-block mx-lg-2">{{Auth::user()->name}}</span>
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

    @component('components.page-header')
    @slot('title') Single Navbar @endslot
    @slot('subtitle') Top Static @endslot
    @endcomponent

    <!-- Page content -->
    <div class="page-content">

        <!-- Main content -->
        <div class="content-wrapper">

            <!-- Content area -->
			<div class="content">

				<!-- Info alert -->
				<div class="alert alert-success alert-dismissible">
					<div class="alert-heading fw-semibold">Static top navbar</div>
					By default, top navbar element is positioned according to the normal flow of the document: immediate children of the <code>&lt;body></code> container and before <code>.page-content</code> container.
					<button type="button" class="btn-close" data-bs-dismiss="alert"></button>
			    </div>
			    <!-- /info alert -->


				<!-- Navbar component -->
				<div class="card">
					<div class="card-header">
						<h5 class="mb-0">Navbar component</h5>
					</div>

					<div class="card-body">
						<p class="mb-3">Navbar is a navigation component, usually displayed on top of the page and includes brand logo, navigation, notifications, user menu, language switcher and other components. By default, navbar has <code>top fixed</code> position and is a direct child of <code>&lt;body></code> container. Navbar toggler appears next to the brand logo on small screens and can be easily adjusted with <code>display</code> utility classes. You can also control responsive collapsing breakpoint directly in the markup. Navbar component is responsive by default and requires <code>.navbar</code> and <code>.navbar-expand{-sm|-md|-lg|-xl|-xxl}</code> classes. Main navigation bar also has static position, but due to the nature of the general layout, it's moved outside all scrolable containers so that it always appears to be sticked to the top.</p>

						<div class="mb-4">
							<h6>Static navbars</h6>
							<p class="mb-3">By default, top and bottom navbars in content area have <code>static</code> position and scroll away along with content. This use case doesn't require any additional classes for <code>.navbar</code> and <code>&lt;body></code> containers, this means navbar appearance depends on its placement: in the template top static navbar is the first direct child of <code>.content-inner</code> or <code>.content</code> containers.</p>

							<div class="rounded overflow-auto border p-1" style="max-height: 275px;">
								<div class="navbar navbar-dark navbar-expand-xl rounded">
									<div class="container-fluid">
										<div class="navbar-brand">
											<a href="index" class="d-inline-flex align-items-center">
												<img src="{{URL::asset('assets/images/logo_icon.svg')}}" alt="">
												<h4 class="d-none d-sm-inline-block text-white lh-1 mb-0 ms-3">Limitless</h4>
											</a>
										</div>

										<div class="d-xl-none ms-2">
											<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbar-demo1-mobile">
												<i class="ph-squares-four"></i>
											</button>
										</div>

										<div class="navbar-collapse collapse order-2 order-xl-1" id="navbar-demo1-mobile">
											<ul class="navbar-nav mt-2 mt-xl-0">
												<li class="nav-item">
													<a href="#" class="navbar-nav-link rounded">Link</a>
												</li>
												<li class="nav-item dropdown">
													<a href="#" class="navbar-nav-link rounded dropdown-toggle" data-bs-toggle="dropdown">Dropdown</a>
													<div class="dropdown-menu">
														<a href="#" class="dropdown-item">Action</a>
														<a href="#" class="dropdown-item">Another action</a>
														<a href="#" class="dropdown-item">Something else here</a>
														<a href="#" class="dropdown-item">One more line</a>
													</div>
												</li>
											</ul>
										</div>

										<ul class="navbar-nav flex-row order-1 order-xl-2 ms-auto">
											<li class="nav-item">
												<a href="#" class="navbar-nav-link navbar-nav-link-icon rounded">
													<i class="ph-bell"></i>
													<span class="badge bg-yellow text-black position-absolute top-0 end-0 translate-middle-top zindex-1 rounded-pill mt-1 me-1">2</span>
												</a>
											</li>
											<li class="nav-item">
												<a href="#" class="navbar-nav-link navbar-nav-link-icon rounded ms-xl-2">
													<i class="ph-chats"></i>
												</a>
											</li>
											<li class="nav-item nav-item-dropdown-xl dropdown ms-xl-2">
												<a href="#" class="navbar-nav-link align-items-center rounded p-1" data-bs-toggle="dropdown">
													<div class="status-indicator-container">
														<img src="{{URL::asset('assets/images/demo/users/face11.jpg')}}" class="w-32px h-32px rounded" alt="">
														<span class="status-indicator bg-success"></span>
													</div>
													<span class="d-none d-xl-inline-block mx-xl-2">Victoria</span>
												</a>

												<div class="dropdown-menu dropdown-menu-end">
													<a href="#" class="dropdown-item">Action</a>
													<a href="#" class="dropdown-item">Another action</a>
													<a href="#" class="dropdown-item">Something else here</a>
													<a href="#" class="dropdown-item">One more line</a>
												</div>
											</li>
										</ul>
									</div>
								</div>

								<div class="px-3 pt-2">
									<div class="row">
										<div class="col-12">
											<div class="bg-secondary bg-opacity-10 p-1 mb-2"></div>
										</div>
										<div class="col-4">
											<div class="bg-danger bg-opacity-10 p-2 mb-2"></div>
										</div>
										<div class="col-8">
											<div class="bg-teal bg-opacity-10 p-2 mb-2"></div>
										</div>
										<div class="col-8">
											<div class="bg-primary bg-opacity-10 p-1 mb-2"></div>
										</div>
										<div class="col-4">
											<div class="bg-indigo bg-opacity-10 p-1 mb-2"></div>
										</div>
										<div class="col-3">
											<div class="bg-purple bg-opacity-10 p-2 mb-2"></div>
										</div>
										<div class="col-6">
											<div class="bg-pink bg-opacity-10 p-2 mb-2"></div>
										</div>
										<div class="col-3">
											<div class="bg-success bg-opacity-10 p-2 mb-2"></div>
										</div>
										<div class="col-6">
											<div class="bg-success bg-opacity-10 p-1 mb-2"></div>
										</div>
										<div class="col-6">
											<div class="bg-primary bg-opacity-10 p-1 mb-2"></div>
										</div>
										<div class="col-4">
											<div class="bg-info bg-opacity-10 p-2 mb-2"></div>
										</div>
										<div class="col-8">
											<div class="bg-warning bg-opacity-10 p-2 mb-2"></div>
										</div>
										<div class="col-8">
											<div class="bg-indigo bg-opacity-10 p-1 mb-2"></div>
										</div>
										<div class="col-4">
											<div class="bg-primary bg-opacity-10 p-1 mb-2"></div>
										</div>
										<div class="col-7">
											<div class="bg-secondary bg-opacity-10 p-2 mb-2"></div>
										</div>
										<div class="col-3">
											<div class="bg-warning bg-opacity-10 p-2 mb-2"></div>
										</div>
										<div class="col-2">
											<div class="bg-success bg-opacity-10 p-2 mb-2"></div>
										</div>
									</div>
								</div>

								<div class="navbar navbar-expand-xl border rounded">
									<div class="container-fluid flex-column flex-sm-row">
										<span class="my-2">© 2022 <a href="https://themeforest.net/item/limitless-responsive-web-application-kit/13080328">Limitless Web App Kit</a></span>

										<ul class="nav">
											<li class="nav-item">
												<a href="https://kopyov.ticksy.com/" class="navbar-nav-link navbar-nav-link-icon rounded" target="_blank">
													<div class="d-flex align-items-center mx-md-1">
														<i class="ph-lifebuoy"></i>
														<span class="d-none d-md-inline-block ms-2">Support</span>
													</div>
												</a>
											</li>
											<li class="nav-item ms-md-1">
												<a href="https://demo.interface.club/limitless/demo/Documentation/index.html" class="navbar-nav-link navbar-nav-link-icon rounded" target="_blank">
													<div class="d-flex align-items-center mx-md-1">
														<i class="ph-file-text"></i>
														<span class="d-none d-md-inline-block ms-2">Docs</span>
													</div>
												</a>
											</li>
											<li class="nav-item ms-md-1">
												<a href="https://themeforest.net/item/limitless-responsive-web-application-kit/13080328?ref=kopyov" class="navbar-nav-link navbar-nav-link-icon text-primary bg-primary bg-opacity-10 fw-semibold rounded" target="_blank">
													<div class="d-flex align-items-center mx-md-1">
														<i class="ph-shopping-cart"></i>
														<span class="d-none d-md-inline-block ms-2">Purchase</span>
													</div>
												</a>
											</li>
										</ul>
									</div>
								</div>
							</div>
						</div>

						<div class="mb-4">
							<h6>Fixed navbars</h6>
							<p class="mb-3">Fixed navbars depend on location in containers. All navbars placed inside <code>.content-inner</code> container scroll away with the content. Once they are moved outside <code>.content-inner</code> container and placed before or after it, navbar becomes "fixed". It will push the content section up or down and will be always displayed within the viewport despite the scrolling position. None of these options requires any additional class names either in containers or navbar itself. Table below lists all available body and navbar classes.</p>
							
							<div class="rounded-top border-top border-start border-end p-1">
								<div class="navbar navbar-dark navbar-expand-xl rounded">
									<div class="container-fluid">
										<div class="navbar-brand">
											<a href="index" class="d-inline-flex align-items-center">
												<img src="{{URL::asset('assets/images/logo_icon.svg')}}" alt="">
												<h4 class="d-none d-sm-inline-block text-white lh-1 mb-0 ms-3">Limitless</h4>
											</a>
										</div>

										<div class="d-xl-none ms-2">
											<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbar-demo3-mobile">
												<i class="ph-squares-four"></i>
											</button>
										</div>

										<div class="navbar-collapse collapse order-2 order-xl-1" id="navbar-demo3-mobile">
											<ul class="navbar-nav mt-2 mt-xl-0">
												<li class="nav-item">
													<a href="#" class="navbar-nav-link rounded">Link</a>
												</li>
												<li class="nav-item dropdown">
													<a href="#" class="navbar-nav-link rounded dropdown-toggle" data-bs-toggle="dropdown">Dropdown</a>
													<div class="dropdown-menu">
														<a href="#" class="dropdown-item">Action</a>
														<a href="#" class="dropdown-item">Another action</a>
														<a href="#" class="dropdown-item">Something else here</a>
														<a href="#" class="dropdown-item">One more line</a>
													</div>
												</li>
											</ul>
										</div>

										<ul class="navbar-nav flex-row order-1 order-xl-2 ms-auto">
											<li class="nav-item">
												<a href="#" class="navbar-nav-link navbar-nav-link-icon rounded">
													<i class="ph-bell"></i>
													<span class="badge bg-yellow text-black position-absolute top-0 end-0 translate-middle-top zindex-1 rounded-pill mt-1 me-1">2</span>
												</a>
											</li>
											<li class="nav-item">
												<a href="#" class="navbar-nav-link navbar-nav-link-icon rounded ms-xl-2">
													<i class="ph-chats"></i>
												</a>
											</li>
											<li class="nav-item nav-item-dropdown-xl dropdown ms-xl-2">
												<a href="#" class="navbar-nav-link align-items-center rounded p-1" data-bs-toggle="dropdown">
													<div class="status-indicator-container">
														<img src="{{URL::asset('assets/images/demo/users/face11.jpg')}}" class="w-32px h-32px rounded" alt="">
														<span class="status-indicator bg-success"></span>
													</div>
													<span class="d-none d-xl-inline-block mx-xl-2">Victoria</span>
												</a>

												<div class="dropdown-menu dropdown-menu-end">
													<a href="#" class="dropdown-item">Action</a>
													<a href="#" class="dropdown-item">Another action</a>
													<a href="#" class="dropdown-item">Something else here</a>
													<a href="#" class="dropdown-item">One more line</a>
												</div>
											</li>
										</ul>
									</div>
								</div>
							</div>

							<div class="overflow-auto border-start border-end p-1" style="max-height: 230px;">
								<div class="px-3 pt-2">
									<div class="row">
										<div class="col-12">
											<div class="bg-secondary bg-opacity-10 p-1 mb-2"></div>
										</div>
										<div class="col-4">
											<div class="bg-danger bg-opacity-10 p-2 mb-2"></div>
										</div>
										<div class="col-8">
											<div class="bg-teal bg-opacity-10 p-2 mb-2"></div>
										</div>
										<div class="col-8">
											<div class="bg-primary bg-opacity-10 p-1 mb-2"></div>
										</div>
										<div class="col-4">
											<div class="bg-indigo bg-opacity-10 p-1 mb-2"></div>
										</div>
										<div class="col-3">
											<div class="bg-purple bg-opacity-10 p-2 mb-2"></div>
										</div>
										<div class="col-6">
											<div class="bg-pink bg-opacity-10 p-2 mb-2"></div>
										</div>
										<div class="col-3">
											<div class="bg-success bg-opacity-10 p-2 mb-2"></div>
										</div>
										<div class="col-6">
											<div class="bg-success bg-opacity-10 p-1 mb-2"></div>
										</div>
										<div class="col-6">
											<div class="bg-primary bg-opacity-10 p-1 mb-2"></div>
										</div>
										<div class="col-4">
											<div class="bg-info bg-opacity-10 p-2 mb-2"></div>
										</div>
										<div class="col-8">
											<div class="bg-warning bg-opacity-10 p-2 mb-2"></div>
										</div>
										<div class="col-8">
											<div class="bg-indigo bg-opacity-10 p-1 mb-2"></div>
										</div>
										<div class="col-4">
											<div class="bg-primary bg-opacity-10 p-1 mb-2"></div>
										</div>
										<div class="col-7">
											<div class="bg-secondary bg-opacity-10 p-2 mb-2"></div>
										</div>
										<div class="col-3">
											<div class="bg-warning bg-opacity-10 p-2 mb-2"></div>
										</div>
										<div class="col-2">
											<div class="bg-success bg-opacity-10 p-2 mb-2"></div>
										</div>
										<div class="col-8">
											<div class="bg-primary bg-opacity-10 p-1 mb-2"></div>
										</div>
										<div class="col-4">
											<div class="bg-indigo bg-opacity-10 p-1 mb-2"></div>
										</div>
										<div class="col-3">
											<div class="bg-purple bg-opacity-10 p-2 mb-2"></div>
										</div>
										<div class="col-12">
											<div class="bg-secondary bg-opacity-10 p-1 mb-2"></div>
										</div>
										<div class="col-4">
											<div class="bg-danger bg-opacity-10 p-2 mb-2"></div>
										</div>
										<div class="col-8">
											<div class="bg-teal bg-opacity-10 p-2 mb-2"></div>
										</div>
									</div>
								</div>
							</div>
							
							<div class="rounded-bottom border-bottom border-start border-end p-1">
								<div class="navbar navbar-expand-xl border rounded">
									<div class="container-fluid flex-column flex-sm-row">
										<span class="my-2">© 2022 <a href="https://themeforest.net/item/limitless-responsive-web-application-kit/13080328">Limitless Web App Kit</a></span>

										<ul class="nav">
											<li class="nav-item">
												<a href="https://kopyov.ticksy.com/" class="navbar-nav-link navbar-nav-link-icon rounded" target="_blank">
													<div class="d-flex align-items-center mx-md-1">
														<i class="ph-lifebuoy"></i>
														<span class="d-none d-md-inline-block ms-2">Support</span>
													</div>
												</a>
											</li>
											<li class="nav-item ms-md-1">
												<a href="https://demo.interface.club/limitless/demo/Documentation/index.html" class="navbar-nav-link navbar-nav-link-icon rounded" target="_blank">
													<div class="d-flex align-items-center mx-md-1">
														<i class="ph-file-text"></i>
														<span class="d-none d-md-inline-block ms-2">Docs</span>
													</div>
												</a>
											</li>
											<li class="nav-item ms-md-1">
												<a href="https://themeforest.net/item/limitless-responsive-web-application-kit/13080328?ref=kopyov" class="navbar-nav-link navbar-nav-link-icon text-primary bg-primary bg-opacity-10 fw-semibold rounded" target="_blank">
													<div class="d-flex align-items-center mx-md-1">
														<i class="ph-shopping-cart"></i>
														<span class="d-none d-md-inline-block ms-2">Purchase</span>
													</div>
												</a>
											</li>
										</ul>
									</div>
								</div>
							</div>
						</div>

						<h6>Navbar markup</h6>
						<p class="mb-3">Navbar markup consists of a set of containers with mandatory and optional classes: <code>.navbar</code> is a wrapper, this class is required for all types of navbars; <code>.navbar-[color]</code> - sets main background color theme and adjusts content color; <code>.navbar-expand-[breakpoint]</code> - responsible for collapsing navbar content behind the button on small screens. See the table below for a full list of classes.</p>

						<div class="mb-3">
							<p class="fw-semibold">Default navbar markup:</p>
							<pre class="language-markup">
								<code>
									&lt;!-- Document body -->
									&lt;body>

										&lt;!-- Main navbar -->
										&lt;div class="navbar navbar-dark navbar-static navbar-expand-lg">
											&lt;div class="container-fluid">

												&lt;!-- Mobile togglers -->
												&lt;div class="d-flex d-lg-none me-2">
													...
												&lt;/div>
												&lt;!-- /mobile togglers -->


												&lt;!-- Navbar brand -->
												&lt;div class="d-inline-flex flex-1 flex-lg-0">
													&lt;a href="index.html" class="navbar-brand d-inline-flex align-items-center">
														...
													&lt;/a>
												&lt;/div>
												&lt;!-- /navbar brand -->


												&lt;!-- Left content -->
												&lt;div class="flex-row">
													...
												&lt;/div>
												&lt;!-- /left content -->


												&lt;!-- Collapsible navbar content (center) -->
												&lt;div class="navbar-collapse justify-content-center flex-lg-1 order-2 order-lg-1 collapse" id="navbar-mobile">
													...
												&lt;/div>
												&lt;!-- /collapsible navbar content (center) -->


												&lt;!-- Right content -->
												&lt;div class="flex-row justify-content-end order-1 order-lg-2">
													...
												&lt;/div>
												&lt;!-- /right content -->

											&lt;/div>
										&lt;/div>
										&lt;!-- /main navbar -->


										&lt;!-- Page content -->
										&lt;div class="page-content">
											...
										&lt;/div>
										&lt;!-- /page content -->

									&lt;/body>
									&lt;!-- /document body -->
								</code>
							</pre>
						</div>

						<div class="mb-3">
							<p class="fw-semibold">Content navbar markup:</p>
							<pre class="language-markup">
								<code>
									&lt;!-- Content navbar -->
									&lt;div class="navbar navbar-dark navbar-expand-xl navbar-static">
										&lt;div class="container-fluid">

											&lt;!-- Mobile toggler -->
											&lt;div class="text-center d-xl-none w-100">
												...
											&lt;/div>
											&lt;!-- /mobile toggler -->


											&lt;!-- Content collapsed on mobile -->
											&lt;div class="navbar-collapse collapse" id="navbar-demo3-mobile">
												...
											&lt;/div>
											&lt;!-- /content collapsed on mobile -->

										&lt;/div>
									&lt;/div>
									&lt;!-- /content navbar -->
								</code>
							</pre>
						</div>
					</div>
				</div>
				<!-- /navbar component -->


				<!-- Navbar classes -->
				<div class="card">
					<div class="card-header">
						<h5 class="mb-0">Navbar classes</h5>
					</div>

					<div class="card-body">
						Navbar is a complex, but very flexible component. It supports different types of content, responsive utilities manage content appearance and spacing on various screen sizes, supports multiple sizing and color options etc. And everything can be changed on-the-fly directly in HTML markup. If you can't find an option you need, you can always extend default SCSS code. Table below demonstrates all available classes that can be used within the navbar:
					</div>

					<div class="table-responsive">
						<table class="table">
							<thead>
								<tr>
									<th style="width: 20%;">Class</th>
									<th style="width: 20%;">Type</th>
									<th>Description</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td><code>.navbar</code></td>
									<td><span class="text-muted">Required</span></td>
									<td>Default navbar class, must be used with any navbar type and color. Responsible for basic navbar and navbar components styling as a parent container.</td>
								</tr>
								<tr>
									<td><code>.navbar-dark</code></td>
									<td><span class="text-muted">Required</span></td>
									<td>This class is used for <code>dark</code> background colors - default dark color is set in <code>$navbar-dark-bg</code> variable, feel free to adjust the color according to your needs.</td>
								</tr>
								<tr>
									<td><code>.navbar.bg-*</code></td>
									<td><span class="text-muted">Optional</span></td>
									<td>Combination of these classes allows you to set custom <strong>light</strong> color to the default <code>light</code> navbar.</td>
								</tr>
								<tr>
									<td><code>.navbar-dark.bg-*</code></td>
									<td><span class="text-muted">Optional</span></td>
									<td>Combination of these classes allows you to set custom <strong>dark</strong> color to the <code>dark</code> navbar. Note - <code>.navbar-dark</code> is required, it's responsible for correct content styling.</td>
								</tr>
								<tr>
									<td><code>.navbar-expand-[breakpoint]</code></td>
									<td><span class="text-muted">Optional</span></td>
									<td>For navbars that never collapse, add the <code>.navbar-expand</code> class on the navbar. For navbars that always collapse, don’t add any <code>.navbar-expand</code> class. Otherwise use this class to change when navbar content collapses behind a button.</td>
								</tr>
								<tr>
									<td><code>.navbar-brand</code></td>
									<td><span class="text-muted">Required</span></td>
									<td>Class for logo container. It can be applied to most elements, but an anchor works best as some elements might require utility classes or custom styles</td>
								</tr>
								<tr>
									<td><code>.navbar-toggler</code></td>
									<td><span class="text-muted">Required</span></td>
									<td>This class needs to be added to the navbar toggle button that toggles navbar content on small screens. Always used with visibility utility classes.</td>
								</tr>
								<tr>
									<td><code>.navbar-collapse</code></td>
									<td><span class="text-muted">Required</span></td>
									<td>Groups and hides navbar contents by a parent breakpoint. Requires an ID for targeting collapsible container when sidebar content is collapsed.</td>
								</tr>
								<tr>
									<td><code>.navbar-nav</code></td>
									<td><span class="text-muted">Required</span></td>
									<td>Responsive navigation container class that adds default styling for navbar navigation.</td>
								</tr>
								<tr>
									<td><code>.nav-item</code></td>
									<td><span class="text-muted">Required</span></td>
									<td>Wrapper class for immediate parents of all navigation links. Responsible for correct styling of nav items</td>
								</tr>
								<tr>
									<td><code>.navbar-nav-link</code></td>
									<td><span class="text-muted">Required</span></td>
									<td>Custom class for links within <code>.nav</code> list, it sets proper styling for links in light and dark navbars.</td>
								</tr>
								<tr>
									<td><code>.navbar-nav-link-icon</code></td>
									<td><span class="text-muted">Optional</span></td>
									<td>For navigation items that contain icon only. This class adjusts left and right paddings to make sure that proportions are preserved.</td>
								</tr>
								<tr>
									<td><code>.navbar-text</code></td>
									<td><span class="text-muted">Required</span></td>
									<td>This class adjusts vertical alignment and horizontal spacing for strings of text</td>
								</tr>
								<tr>
									<td><code>.sticky-top</code></td>
									<td><span class="text-muted">Optional</span></td>
									<td>Adds <code>position: sticky;</code> to the navbar - it's treated as relatively positioned until its containing block crosses a specified threshold, at which point it is treated as fixed. Support is limited.</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>
				<!-- /navbar classes -->


				<!-- Body classes -->
				<div class="card">
					<div class="card-header">
						<h5 class="mb-0">Body classes</h5>
					</div>

					<div class="card-body">
						If you want to place navbar in non-static positions, you can choose from fixed to the top, fixed to the bottom, or stickied to the top (scrolls with the page until it reaches the top, then stays there). Fixed navbars use <code>position: fixed</code>, meaning they’re pulled from the normal flow of the DOM and require custom classes added to the <code>&lt;body&gt;</code> container to prevent overlap with other elements. The following table demonstrates the list of classes for <code>&lt;body&gt;</code> container if navbar has non-static position:
					</div>

					<div class="table-responsive">
						<table class="table table-bordered">
							<thead>
								<tr>
									<th style="width: 20%;">Class</th>
									<th>Description</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td><code>.navbar-top</code></td>
									<td>This class adds <code>top</code> padding to the <code>&lt;body&gt;</code> container. Works only with default navbar height. If another height is specified, apply another class (see the line below).</td>
								</tr>
								<tr>
									<td><code>.navbar-bottom</code></td>
									<td>This class adds <code>bottom</code> padding to the <code>&lt;body&gt;</code> container. Works only with default navbar height. If another height is specified, apply another class (see the line below).</td>
								</tr>
								<tr>
									<td><code>.navbar-top-[size]</code></td>
									<td>Controls <code>top</code> spacing of <code>&lt;body&gt;</code> container, if navbar has optional height. Available sizes: small (<code>*-sm</code>) and large (<code>*-lg</code>). Default navbar requires <code>.navbar-top</code> class only.</td>
								</tr>
								<tr>
									<td><code>.navbar-bottom-[size]</code></td>
									<td>Controls <code>bottom</code> spacing of <code>&lt;body&gt;</code> container, if navbar has optional height. Available sizes: small (<code>*-sm</code>) and large (<code>*-lg</code>). Default navbar requires <code>.navbar-bottom</code> class only.</td>
								</tr>
								<tr>
									<td><code>.navbar-[size]-[size]-top</code></td>
									<td>Use these classes if the layout has multiple <code>top</code> navbars, where first <code>[size]</code> is the size of the first navbar, second <code>[size]</code> - height of the second navbar. In this particular use case, <code>[size]</code> can be: <code>lg</code> if large height, <code>md</code> is default height <code>sm</code> is small height.  
								</td></tr>
								<tr>
									<td><code>.navbar-[size]-[size]-bottom</code></td>
									<td>Use these classes if the layout has multiple <code>bottom</code> navbars, where first <code>[size]</code> is the size of the first navbar, second <code>[size]</code> - height of the second navbar. In this particular use case, <code>[size]</code> can be: <code>lg</code> if large height, <code>md</code> is default height <code>sm</code> is small height.  
								</td></tr>
							</tbody>
						</table>
					</div>
				</div>
				<!-- /body classes -->

			</div>
			<!-- /content area -->

        </div>
        <!-- /main content -->

    </div>
    <!-- /page content -->

    @include('layouts.footer')

    @include('layouts.notification')

    @include('layouts.right-sidebar')

</body>
</html>
